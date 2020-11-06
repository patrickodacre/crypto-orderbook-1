const https = require('https')
const express = require('express')
const app = express()

const path = require('path')
const edge = require('edge.js')

edge.registerViews(path.join(__dirname, './views'))

// allow quick change of host / port
const [,, host = "127.0.0.1", port="4000"] = process.argv

function getPoloniexOrderBook() {
    return new Promise((resolve, reject) => {
        https.get('https://poloniex.com/public?command=returnOrderBook&currencyPair=BTC_ETH&depth=500', res => {
            let body = ""

            res.on("data", d => {
                body += d
            })

            res.on("end", () => {
                try {
                    let json = JSON.parse(body)
                    resolve(json)
                } catch (error) {
                    reject(error)
                }
            })

        }).on('error', e => {
            reject(e)
        })
    })
}

function getBittrexBook() {
    return new Promise((resolve, reject) => {
        https.get('https://api.bittrex.com/v3/markets/ETH-BTC/orderbook?depth=500', res => {

            let body = ""

            res.on("data", d => {
                body += d
            })

            res.on("end", () => {
                try {
                    let json = JSON.parse(body)
                    resolve(json)
                } catch (error) {
                    reject(error)
                }
            })

        }).on('error', e => {
            reject(e)
        })
    })
}

app.get('/orderbook', (req, res) => {
    const pBook = getPoloniexOrderBook()
    const bBook = getBittrexBook()

    return Promise.all([pBook, bBook])
        .then(([poloniex, bittrex]) => {

            const {asks: pAsks, bids: pBids} = poloniex
            const {ask: bAsks, bid: bBids} = bittrex

            let askPriceToAmount = {poloniex: {}, bittrex: {}}
            let bidPriceToAmount = {poloniex: {}, bittrex: {}}

            const seenAskPrices = {}
            const askPrices = []

            const seenBidPrices = {}
            const bidPrices = []
            // create our sorted price lists
            // and our objects to lookup our liquidity totals
            {
                pAsks.forEach(([price, amount]) => {
                    // avoid duplicates
                    if (! seenAskPrices[price]) {
                        seenAskPrices[price] = true
                        askPrices.push(price)
                    }

                    askPriceToAmount.poloniex[price] = (amount).toFixed(8)
                })

                bAsks.forEach(({quantity: amount, rate: price}) => {
                    // avoid duplicates
                    if (! seenAskPrices[price]) {
                        seenAskPrices[price] = true
                        askPrices.push(price)
                    }

                    askPriceToAmount.bittrex[price] = amount
                })

                pBids.forEach(([price, amount]) => {
                    // avoid duplicates
                    if (! seenBidPrices[price]) {
                        seenBidPrices[price] = true
                        bidPrices.push(price)
                    }

                    bidPriceToAmount.poloniex[price] = (amount).toFixed(8)
                })

                bBids.forEach(({quantity: amount, rate: price}) => {
                    // avoid duplicates
                    if (! seenBidPrices[price]) {
                        seenBidPrices[price] = true
                        bidPrices.push(price)
                    }

                    bidPriceToAmount.bittrex[price] = amount
                })

                // high to low
                bidPrices.sort((a, b) => b-a)
                // low to high
                askPrices.sort()
            }

            // calculate our totals for the UI
            let askTotals
            let bidTotals
            {
                askTotals = askPrices.reduce((carry, p) => {
                    let poloniexLiquidity = askPriceToAmount.poloniex[p] || 0
                    poloniexLiquidity = parseFloat(poloniexLiquidity)

                    let bittrexLiquidity = askPriceToAmount.bittrex[p] || 0
                    bittrexLiquidity = parseFloat(bittrexLiquidity)

                    carry[p] = (poloniexLiquidity + bittrexLiquidity).toFixed(8)
                    return carry
                }, {})

                bidTotals = bidPrices.reduce((carry, p) => {
                    let poloniexLiquidity = bidPriceToAmount.poloniex[p] || 0
                    poloniexLiquidity = parseFloat(poloniexLiquidity)

                    let bittrexLiquidity = bidPriceToAmount.bittrex[p] || 0
                    bittrexLiquidity = parseFloat(bittrexLiquidity)

                    carry[p] = (poloniexLiquidity + bittrexLiquidity).toFixed(8)
                    return carry
                }, {})

            }

            // add some fake data to show what the UI
            // looks like when there is a price overlap
            {
                const _fakePrice = "0.02712677"
                const _fakeAmount = "99.00000000"
                bidPrices.unshift(_fakePrice)
                askPrices.unshift(_fakePrice)
                bidTotals[_fakePrice] = _fakeAmount
                askTotals[_fakePrice] = _fakeAmount

                bidPriceToAmount.poloniex[_fakePrice] = _fakeAmount
                askPriceToAmount.bittrex[_fakePrice] = _fakeAmount
            }

            res.send(edge.render('index', {
                bidPrices,
                askPrices,
                bidPriceToAmount,
                askPriceToAmount,
                askTotals,
                bidTotals,
            }))
        })

})

// server
app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}/`)
})
