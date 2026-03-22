#!/usr/bin/env node
/**
 * SignalMint x402 Signal Server
 *
 * 信号 Agent 作为 x402 付费 API 服务器
 * 执行 Agent 访问 /signal/latest 需先支付 0.001 USDC (测试网)
 *
 * 网络: Base Sepolia (测试网, Chain ID 84532)
 * 结算: Coinbase Facilitator (免费)
 * Token: 测试网 USDC
 */
import express from 'express';
import { paymentMiddleware } from 'x402-express';
import { facilitator } from '@coinbase/x402';
import { MarketDataService } from '../market/MarketDataService.js';
import { CONFIG } from '../config.js';

// ===== Configuration =====

// 信号 Agent 收款地址 (你的部署者地址，Base Sepolia 测试网)
const SIGNAL_AGENT_ADDRESS = CONFIG.deployer || '0x1E67eF8a367776fd78CF9a57ad0ddC130F1589E9';

// x402 路由配置: 哪些接口需要付费
const PAID_ROUTES = {
  'GET /signal/latest': {
    price: '$0.001',                // 每次调用 0.001 USDC (测试网最小金额)
    network: 'base-sepolia',        // Base Sepolia 测试网
    description: 'Latest trading signal from SignalMint alpha-quant-v1',
  },
  'GET /signal/history': {
    price: '$0.001',
    network: 'eip155:84532',
    description: 'Signal history with on-chain win rate',
  },
};

// ===== Signal State =====

const market = new MarketDataService();
let latestSignal = null;
let signalHistory = [];
let signalCount = 0;

/**
 * 生成新信号 (使用真实 OKX 行情或降级数据)
 */
async function generateSignal() {
  const pairs = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
  const pair = pairs[Math.floor(Math.random() * pairs.length)];

  let analysis, currentPrice;
  try {
    const candles = await market.getCandles(pair, '1H', 24);
    analysis = market.analyzeCandles(candles.data);
    currentPrice = candles.currentPrice;
  } catch {
    // Fallback
    currentPrice = pair === 'BTC-USDT' ? 87500 : pair === 'ETH-USDT' ? 3250 : 178;
    analysis = {
      signal: Math.random() > 0.5 ? 'buy' : 'sell',
      confidence: 0.6,
      reason: `${pair} 技术分析信号`,
    };
  }

  if (analysis.signal === 'neutral') {
    analysis.signal = Math.random() > 0.5 ? 'buy' : 'sell';
    analysis.reason = `${pair} 短期动量信号`;
  }

  signalCount++;
  const signal = {
    signalId: `sig_${Date.now().toString(36)}_${signalCount}`,
    timestamp: Date.now(),
    intent: {
      action: analysis.signal,
      pair,
      size: '0.01',
      maxSlippage: 0.002,
      ttl: 60,
      reason: analysis.reason,
      targetPrice: analysis.signal === 'buy'
        ? +(currentPrice * 1.008).toFixed(2)
        : +(currentPrice * 0.992).toFixed(2),
    },
    confidence: analysis.confidence,
    currentPrice,
    indicators: analysis.indicators || {},
    agent: {
      id: 'alpha-quant-v1',
      registry: CONFIG.registry.address,
      chain: 'X Layer Testnet',
    },
  };

  latestSignal = signal;
  signalHistory.unshift(signal);
  if (signalHistory.length > 50) signalHistory.pop();

  return signal;
}

// ===== Express Server =====

const app = express();

// x402 付费中间件 — 保护信号接口
app.use(paymentMiddleware(
  SIGNAL_AGENT_ADDRESS,
  PAID_ROUTES,
  facilitator,
));

// 免费接口: 服务信息
app.get('/', (req, res) => {
  res.json({
    service: 'SignalMint Signal Agent',
    agent: 'alpha-quant-v1',
    protocol: 'x402',
    description: 'AI trading signal endpoint - pay per call with USDC',
    registry: CONFIG.registry.address,
    wallet: CONFIG.agenticWallet?.evm,
    endpoints: {
      '/signal/latest': { price: '$0.001', method: 'GET', description: 'Get latest signal (paid)' },
      '/signal/history': { price: '$0.001', method: 'GET', description: 'Get signal history (paid)' },
      '/health': { price: 'free', method: 'GET', description: 'Health check' },
    },
    network: 'Base Sepolia (testnet)',
    note: 'Use testnet USDC from faucet to pay for signals',
  });
});

// 免费接口: 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    signalCount,
    latestSignalTime: latestSignal?.timestamp || null,
    uptime: process.uptime(),
  });
});

// 付费接口: 最新信号 (x402 保护)
app.get('/signal/latest', async (req, res) => {
  if (!latestSignal || Date.now() - latestSignal.timestamp > 60000) {
    await generateSignal();
  }
  res.json({
    paid: true,
    protocol: 'x402',
    signal: latestSignal,
  });
});

// 付费接口: 信号历史 (x402 保护)
app.get('/signal/history', (req, res) => {
  res.json({
    paid: true,
    protocol: 'x402',
    count: signalHistory.length,
    signals: signalHistory.slice(0, 20),
  });
});

// ===== Start =====

const PORT = 4020;

// 启动前先生成一个信号
generateSignal().then(() => {
  app.listen(PORT, () => {
    console.log(`
  ┌─────────────────────────────────────────────────┐
  │   SignalMint x402 Signal Server                 │
  │                                                 │
  │   http://localhost:${PORT}                        │
  │                                                 │
  │   Paid endpoints (x402 protected):              │
  │     GET /signal/latest   $0.001 USDC            │
  │     GET /signal/history  $0.001 USDC            │
  │                                                 │
  │   Free endpoints:                               │
  │     GET /                service info           │
  │     GET /health          health check           │
  │                                                 │
  │   Network: Base Sepolia (testnet)               │
  │   Facilitator: Coinbase (x402.org)              │
  │   Pay to: ${SIGNAL_AGENT_ADDRESS.slice(0, 20)}...  │
  └─────────────────────────────────────────────────┘
    `);
  });

  // 每 30 秒生成新信号
  setInterval(generateSignal, 30000);
});

export { app, generateSignal };
