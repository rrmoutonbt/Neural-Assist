/**
 * BinanceService - Real-time cryptocurrency price data from Binance public API
 * No API key required for public endpoints
 */
const BinanceService = {
  BASE_URL: 'https://api.binance.com/api/v3',

  // Cache to avoid hammering the API
  _cache: {},
  _cacheTimeout: 30000, // 30 seconds

  // Symbol mapping from common tickers to Binance pairs
  CRYPTO_TO_BINANCE: {
    'BTC': 'BTCUSDT', 'ETH': 'ETHUSDT', 'XRP': 'XRPUSDT',
    'SOL': 'SOLUSDT', 'ADA': 'ADAUSDT', 'DOT': 'DOTUSDT',
    'LINK': 'LINKUSDT', 'AVAX': 'AVAXUSDT', 'MATIC': 'MATICUSDT',
    'DOGE': 'DOGEUSDT', 'BNB': 'BNBUSDT', 'LTC': 'LTCUSDT',
    'USDT': null, 'USDC': null // stablecoins are always ~$1
  },

  // Get Binance symbol for a crypto ticker
  getBinanceSymbol(ticker) {
    const upper = (ticker || '').toUpperCase();
    if (upper in this.CRYPTO_TO_BINANCE) return this.CRYPTO_TO_BINANCE[upper];
    return upper + 'USDT'; // default fallback
  },

  // Get current price for a symbol
  async getPrice(symbol) {
    try {
      const url = `${this.BASE_URL}/ticker/price?symbol=${symbol}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return parseFloat(data.price);
    } catch (e) {
      console.warn('BinanceService.getPrice failed:', symbol, e.message);
      return null;
    }
  },

  // Get 24hr ticker data (price, change, volume, high, low)
  async get24hr(symbol) {
    const cacheKey = `24hr_${symbol}`;
    const cached = this._cache[cacheKey];
    if (cached && Date.now() - cached.time < this._cacheTimeout) return cached.data;

    try {
      const url = `${this.BASE_URL}/ticker/24hr?symbol=${symbol}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const result = {
        price: parseFloat(data.lastPrice),
        change: parseFloat(data.priceChange),
        changePercent: parseFloat(data.priceChangePercent),
        high: parseFloat(data.highPrice),
        low: parseFloat(data.lowPrice),
        volume: parseFloat(data.volume),
      };
      this._cache[cacheKey] = { data: result, time: Date.now() };
      return result;
    } catch (e) {
      console.warn('BinanceService.get24hr failed:', symbol, e.message);
      return null;
    }
  },

  // Get multiple 24hr tickers at once (batch)
  async getMultiple24hr(symbols) {
    const cacheKey = 'multi24hr';
    const cached = this._cache[cacheKey];
    if (cached && Date.now() - cached.time < this._cacheTimeout) {
      return symbols.reduce((acc, s) => { acc[s] = cached.data[s] || null; return acc; }, {});
    }

    try {
      const symbolsParam = JSON.stringify(symbols);
      const url = `${this.BASE_URL}/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`;
      const res = await fetch(url);
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      data.forEach(d => {
        map[d.symbol] = {
          price: parseFloat(d.lastPrice),
          change: parseFloat(d.priceChange),
          changePercent: parseFloat(d.priceChangePercent),
          high: parseFloat(d.highPrice),
          low: parseFloat(d.lowPrice),
          volume: parseFloat(d.volume),
        };
      });
      this._cache[cacheKey] = { data: map, time: Date.now() };
      return symbols.reduce((acc, s) => { acc[s] = map[s] || null; return acc; }, {});
    } catch (e) {
      console.warn('BinanceService.getMultiple24hr failed:', e.message);
      return {};
    }
  },

  // Get multiple prices at once
  async getPrices(symbols) {
    const cacheKey = 'allPrices';
    const cached = this._cache[cacheKey];
    if (cached && Date.now() - cached.time < 10000) {
      return symbols.reduce((acc, s) => { acc[s] = cached.data[s] || null; return acc; }, {});
    }

    try {
      const url = `${this.BASE_URL}/ticker/price`;
      const res = await fetch(url);
      if (!res.ok) return {};
      const data = await res.json();
      const priceMap = {};
      data.forEach(d => { priceMap[d.symbol] = parseFloat(d.price); });
      this._cache[cacheKey] = { data: priceMap, time: Date.now() };
      return symbols.reduce((acc, s) => { acc[s] = priceMap[s] || null; return acc; }, {});
    } catch (e) {
      console.warn('BinanceService.getPrices failed:', e.message);
      return {};
    }
  },

  // Get kline/candlestick data for chart
  async getKlines(symbol, interval, limit) {
    interval = interval || '1h';
    limit = limit || 24;
    const cacheKey = `klines_${symbol}_${interval}_${limit}`;
    const cached = this._cache[cacheKey];
    if (cached && Date.now() - cached.time < 60000) return cached.data;

    try {
      const url = `${this.BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.json();
      const data = raw.map(k => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        value: parseFloat(k[4]) // alias for sparkline compat
      }));
      this._cache[cacheKey] = { data, time: Date.now() };
      return data;
    } catch (e) {
      console.warn('BinanceService.getKlines failed:', symbol, e.message);
      return null;
    }
  },

  // Get mini sparkline data (last 24 1-hour candles)
  async getSparkline(symbol) {
    return this.getKlines(symbol, '1h', 24);
  },

  // Enrich an array of holdings with real Binance prices
  // Each holding should have a 'symbol' property (e.g. 'BTC', 'ETH')
  async enrichHoldings(holdings) {
    if (!holdings || holdings.length === 0) return holdings;

    // Collect unique Binance symbols needed
    const binanceSymbols = [];
    holdings.forEach(h => {
      const bs = this.getBinanceSymbol(h.symbol);
      if (bs && !binanceSymbols.includes(bs)) binanceSymbols.push(bs);
    });

    if (binanceSymbols.length === 0) return holdings;

    // Fetch all 24hr data in one batch call
    const tickerData = await this.getMultiple24hr(binanceSymbols);

    // Update holdings with real prices
    return holdings.map(h => {
      const bs = this.getBinanceSymbol(h.symbol);
      if (!bs) {
        // Stablecoin - price is $1
        return { ...h, currentPrice: 1, change24h: 0, value: h.amount * 1 };
      }
      const td = tickerData[bs];
      if (!td) return h; // Binance data unavailable, keep mock values

      return {
        ...h,
        currentPrice: td.price,
        change24h: td.changePercent,
        value: h.amount * td.price,
        _binanceData: td // attach full data for KPI use
      };
    });
  }
};
