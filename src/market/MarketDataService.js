/**
 * MarketDataService - 市场数据服务
 * 调用真实 OKX API，覆盖 Agent Trade Kit Market 模块
 *
 * 工具调用：
 * - market candles   → GET /api/v5/market/candles
 * - market funding-rate → GET /api/v5/public/funding-rate
 * - market depth     → GET /api/v5/market/books
 */

import { ProxyAgent } from 'undici';

const OKX_BASE = 'https://www.okx.com';

// Auto-detect proxy from environment, fallback to common local proxy
const PROXY_URL = process.env.https_proxy || process.env.HTTPS_PROXY
  || process.env.http_proxy || process.env.HTTP_PROXY
  || 'http://127.0.0.1:7890'; // Fallback: common local proxy

async function okxFetch(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${OKX_BASE}${path}${qs ? '?' + qs : ''}`;
  const fetchOptions = {
    headers: { 'Content-Type': 'application/json' },
  };
  if (PROXY_URL) {
    fetchOptions.dispatcher = new ProxyAgent(PROXY_URL);
  }
  const res = await fetch(url, fetchOptions);
  const json = await res.json();
  if (json.code !== '0') {
    throw new Error(`OKX API Error [${path}]: ${json.msg || json.code}`);
  }
  return json.data;
}

export class MarketDataService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 5000; // 5s cache for rate limiting
  }

  /**
   * [Agent Trade Kit] market candles
   * 拉取真实 K 线数据
   * OKX API: GET /api/v5/market/candles
   */
  async getCandles(pair, interval = '1H', limit = 24) {
    const cacheKey = `candles:${pair}:${interval}`;
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    const data = await okxFetch('/api/v5/market/candles', {
      instId: pair,
      bar: interval,
      limit: String(limit),
    });

    // OKX returns: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    const candles = data.map(d => ({
      ts: parseInt(d[0]),
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    })).reverse(); // OKX returns newest first, we want chronological

    const currentPrice = candles[candles.length - 1]?.close || 0;

    const result = {
      tool: 'market candles',
      pair,
      interval,
      data: candles,
      currentPrice,
      source: 'OKX API /api/v5/market/candles',
    };

    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * [Agent Trade Kit] market funding-rate
   * 拉取真实资金费率
   * OKX API: GET /api/v5/public/funding-rate
   */
  async getFundingRate(pair) {
    // Funding rate only works for SWAP instruments
    const swapInstId = pair.replace('-', '-').concat('-SWAP');
    const cacheKey = `funding:${swapInstId}`;
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    try {
      const data = await okxFetch('/api/v5/public/funding-rate', {
        instId: swapInstId,
      });

      const item = data[0];
      const rate = parseFloat(item.fundingRate || '0');
      const nextRate = parseFloat(item.nextFundingRate || '0');

      const result = {
        tool: 'market funding-rate',
        pair,
        instId: swapInstId,
        fundingRate: rate,
        nextFundingRate: nextRate,
        fundingTime: parseInt(item.fundingTime || '0'),
        sentiment: rate > 0 ? 'bullish' : rate < 0 ? 'bearish' : 'neutral',
        source: 'OKX API /api/v5/public/funding-rate',
      };

      this._setCache(cacheKey, result);
      return result;
    } catch {
      // Fallback if SWAP not available for this pair
      return {
        tool: 'market funding-rate',
        pair,
        fundingRate: 0,
        nextFundingRate: 0,
        fundingTime: Date.now() + 4 * 3600000,
        sentiment: 'neutral',
        source: 'fallback (SWAP not available)',
      };
    }
  }

  /**
   * [Agent Trade Kit] market depth
   * 拉取真实深度数据
   * OKX API: GET /api/v5/market/books
   */
  async getDepth(pair, limit = 20) {
    const cacheKey = `depth:${pair}`;
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    const data = await okxFetch('/api/v5/market/books', {
      instId: pair,
      sz: String(limit),
    });

    const book = data[0];
    const asks = book.asks.map(a => ({ price: parseFloat(a[0]), size: parseFloat(a[1]) }));
    const bids = book.bids.map(b => ({ price: parseFloat(b[0]), size: parseFloat(b[1]) }));

    const bestAsk = asks[0]?.price || 0;
    const bestBid = bids[0]?.price || 0;
    const midPrice = (bestAsk + bestBid) / 2;

    const result = {
      tool: 'market depth',
      pair,
      asks,
      bids,
      bestAsk,
      bestBid,
      midPrice: +midPrice.toFixed(2),
      spread: +(bestAsk - bestBid).toFixed(2),
      spreadPercent: +((bestAsk - bestBid) / midPrice * 100).toFixed(4),
      source: 'OKX API /api/v5/market/books',
    };

    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * 技术指标分析（基于真实 K 线数据）
   */
  analyzeCandles(candles) {
    if (!candles || candles.length < 7) {
      return { signal: 'neutral', confidence: 0, reason: '数据不足' };
    }

    const closes = candles.map(c => c.close);
    const len = closes.length;

    // SMA
    const sma7 = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const sma25 = closes.slice(Math.max(0, len - 25)).reduce((a, b) => a + b, 0) / Math.min(25, len);

    const currentPrice = closes[len - 1];
    const priceChange = len >= 4 ? (currentPrice - closes[len - 4]) / closes[len - 4] : 0;

    // Volume trend
    const recentVolumes = candles.slice(-5).map(c => c.volume);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const volumeIncreasing = recentVolumes[recentVolumes.length - 1] > avgVolume;

    // RSI simplified (14-period)
    const rsiPeriod = Math.min(14, len - 1);
    let gains = 0, losses = 0;
    for (let i = len - rsiPeriod; i < len; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / rsiPeriod;
    const avgLoss = losses / rsiPeriod || 0.001;
    const rsi = 100 - (100 / (1 + avgGain / avgLoss));

    // Resistance / Support
    const highs = candles.slice(-12).map(c => c.high);
    const lows = candles.slice(-12).map(c => c.low);
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);

    // Signal logic
    let signal = 'neutral';
    let confidence = 0.5;
    let reason = '';

    if (currentPrice > sma7 && sma7 > sma25 && volumeIncreasing && rsi < 75) {
      signal = 'buy';
      confidence = 0.60 + Math.min(0.2, Math.abs(priceChange) * 5);
      if (currentPrice > resistance * 0.998) {
        reason = `突破 1H 关键阻力位 ${resistance.toFixed(0)}，SMA7(${sma7.toFixed(0)}) > SMA25(${sma25.toFixed(0)}) 金叉，RSI ${rsi.toFixed(0)} 放量确认`;
      } else {
        reason = `价格站上 SMA7(${sma7.toFixed(0)}) 和 SMA25(${sma25.toFixed(0)})，RSI ${rsi.toFixed(0)}，多头趋势延续`;
      }
    } else if (currentPrice < sma7 && sma7 < sma25 && rsi > 25) {
      signal = 'sell';
      confidence = 0.58 + Math.min(0.2, Math.abs(priceChange) * 5);
      reason = `价格跌破 SMA7(${sma7.toFixed(0)})，SMA7 < SMA25 死叉，RSI ${rsi.toFixed(0)}，空头占优`;
    } else if (rsi > 78) {
      signal = 'sell';
      confidence = 0.55;
      reason = `RSI ${rsi.toFixed(0)} 超买，短期回调概率高`;
    } else if (rsi < 22) {
      signal = 'buy';
      confidence = 0.55;
      reason = `RSI ${rsi.toFixed(0)} 超卖，反弹概率高`;
    } else {
      reason = `市场无明显方向，RSI ${rsi.toFixed(0)}，SMA7=${sma7.toFixed(0)}，观望`;
    }

    return {
      signal,
      confidence: +confidence.toFixed(2),
      reason,
      indicators: {
        sma7: +sma7.toFixed(2),
        sma25: +sma25.toFixed(2),
        rsi: +rsi.toFixed(1),
        currentPrice,
        priceChange: +(priceChange * 100).toFixed(2),
        resistance: +resistance.toFixed(2),
        support: +support.toFixed(2),
        volumeIncreasing,
      },
    };
  }

  // ===== Cache helpers =====
  _getCache(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.ts < this.cacheExpiry) return entry.data;
    return null;
  }

  _setCache(key, data) {
    this.cache.set(key, { data, ts: Date.now() });
  }
}
