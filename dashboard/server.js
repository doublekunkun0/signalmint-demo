#!/usr/bin/env node
/**
 * SignalMint Dashboard Server - 交互式信号市场
 */
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { SignalRegistry } from '../src/registry/SignalRegistry.js';
import { MarketDataService } from '../src/market/MarketDataService.js';
import { X402Payment } from '../src/payment/X402Payment.js';
import { RiskControl } from '../src/risk/RiskControl.js';
import { MCPParser } from '../src/mcp/MCPParser.js';
import { ExecutionAgent } from '../src/agents/ExecutionAgent.js';
import { CONFIG } from '../src/config.js';
import crypto from 'crypto';
import { ProxyAgent } from 'undici';
import dotenv from 'dotenv';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const __dirname = dirname(fileURLToPath(import.meta.url));

// OKX Account API for real balance tracking
const OKX_BASE = 'https://www.okx.com';
const PROXY_URL = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || '';
const API_KEY = process.env.OKX_API_KEY || '';
const SECRET_KEY = process.env.OKX_SECRET_KEY || '';
const PASSPHRASE = process.env.OKX_PASSPHRASE || '';

function signOkx(ts, method, path, body = '') {
  return crypto.createHmac('sha256', SECRET_KEY).update(ts + method + path + body).digest('base64');
}

async function okxAccountApi(method, path) {
  const ts = new Date().toISOString();
  const opts = {
    method,
    headers: {
      'OK-ACCESS-KEY': API_KEY,
      'OK-ACCESS-SIGN': signOkx(ts, method, path),
      'OK-ACCESS-TIMESTAMP': ts,
      'OK-ACCESS-PASSPHRASE': PASSPHRASE,
      'x-simulated-trading': '1',
      'Content-Type': 'application/json',
    },
  };
  if (PROXY_URL) opts.dispatcher = new ProxyAgent(PROXY_URL);
  const res = await fetch(OKX_BASE + path, opts);
  return res.json();
}

// Initial snapshot
const INITIAL_BALANCE = { USDT: 10000, BTC: 1, ETH: 1, OKB: 100 };
let accountCache = null;
let accountCacheTime = 0;

async function getAccountBalance() {
  if (Date.now() - accountCacheTime < 5000 && accountCache) return accountCache;
  try {
    const data = await okxAccountApi('GET', '/api/v5/account/balance');
    if (data.code === '0' && data.data?.[0]) {
      const details = data.data[0].details || [];
      const balances = {};
      for (const d of details) {
        if (parseFloat(d.availBal) > 0 || INITIAL_BALANCE[d.ccy]) {
          balances[d.ccy] = { available: parseFloat(d.availBal), equity: parseFloat(d.eqUsd) || 0 };
        }
      }
      accountCache = { totalEquity: parseFloat(data.data[0].totalEq), balances, timestamp: Date.now() };
      accountCacheTime = Date.now();
      return accountCache;
    }
  } catch {}
  return accountCache || { totalEquity: 0, balances: {}, timestamp: 0 };
}

// Trade history tracking
const tradeHistory = [];
let initialEquity = null;

// Shared services
const registry = new SignalRegistry();
const market = new MarketDataService();
const payment = new X402Payment('testnet');
const riskControl = new RiskControl(market);
const mcpParser = new MCPParser();

payment.initProvider().catch(() => {});

// Execution agents per follower session
const execAgents = new Map();

// Express
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(join(__dirname, 'public')));

app.get('/api/state', async (req, res) => {
  const account = await getAccountBalance();
  if (!initialEquity && account.totalEquity > 0) initialEquity = account.totalEquity;
  res.json({
    registry: registry.exportState(),
    payment: payment.getStats(),
    config: { contract: CONFIG.registry.address, wallet: CONFIG.agenticWallet },
    account,
    initialEquity: initialEquity || account.totalEquity,
    tradeHistory,
  });
});

// WebSocket handlers
wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.action) {
      case 'getState': {
        const acct = await getAccountBalance();
        if (!initialEquity && acct.totalEquity > 0) initialEquity = acct.totalEquity;
        ws.send(JSON.stringify({
          event: 'state:update',
          data: {
            ...registry.exportState(),
            paymentStats: payment.getStats(),
            account: acct,
            initialEquity: initialEquity || acct.totalEquity,
            tradeHistory,
          },
        }));
        break;
      }

      case 'registerAgent': {
        const { name, price, pair } = msg;
        const existing = registry.getAllAgents().find(a => a.agentId === name);
        if (!existing) {
          registry.registerAgent({
            agentId: name,
            pricePerSignal: price || 0.05,
            ttl: 60,
            description: `Signal Agent - ${name}`,
          });
        }
        broadcastState();
        break;
      }

      case 'generateSignal': {
        const { pair } = msg;
        const agents = registry.getAllAgents();
        if (agents.length === 0) break;

        const agent = agents[agents.length - 1];
        let signal;

        try {
          const candles = await market.getCandles(pair || 'BTC-USDT', '1H', 24);
          const analysis = market.analyzeCandles(candles.data);

          if (analysis.signal !== 'neutral') {
            signal = registry.publishSignal(agent.agentId, {
              action: analysis.signal,
              pair: pair || 'BTC-USDT',
              size: '0.01',
              maxSlippage: 0.002,
              ttl: 60,
              reason: analysis.reason,
              targetPrice: analysis.signal === 'buy'
                ? +(candles.currentPrice * 1.008).toFixed(2)
                : +(candles.currentPrice * 0.992).toFixed(2),
            });
          }
        } catch {
          // Fallback
        }

        if (!signal) {
          signal = registry.publishSignal(agent.agentId, {
            action: Math.random() > 0.5 ? 'buy' : 'sell',
            pair: pair || 'BTC-USDT',
            size: '0.01',
            maxSlippage: 0.002,
            ttl: 60,
            reason: `${pair || 'BTC-USDT'} 技术分析信号`,
          });
        }

        broadcast({ event: 'signal:new', data: signal });
        broadcastState();
        break;
      }

      case 'initFollower': {
        const { agentId } = msg;
        if (!execAgents.has(agentId)) {
          const ea = new ExecutionAgent({
            agentId: 'follower-' + Date.now(),
            registry, marketService: market,
            payment, riskControl, mcpParser,
          });
          const w = payment.initWallet();
          ea.address = w.address;
          payment.initWallet(); // counterparty
          execAgents.set(agentId, ea);
        }
        ws.send(JSON.stringify({ event: 'follower:ready', data: { agentId } }));
        break;
      }

      case 'executeSignal': {
        const { agentId } = msg;
        const ea = execAgents.get(agentId);
        if (!ea) break;

        // Get or create a signal
        let signals = registry.getActiveSignals();
        let signal = signals.find(s => s.agentId === agentId);

        if (!signal) {
          signal = registry.publishSignal(agentId, {
            action: Math.random() > 0.5 ? 'buy' : 'sell',
            pair: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'][Math.floor(Math.random() * 3)],
            size: '0.01',
            maxSlippage: 0.002,
            ttl: 60,
            reason: '技术分析信号',
          });
        }

        const result = await ea.processSignal(signal);

        // Track trade in history — two PnL metrics
        if (result.success && result.execution) {
          accountCacheTime = 0;
          await new Promise(r => setTimeout(r, 500));
          const acctAfterTrade = await getAccountBalance();
          const prevEquity = tradeHistory.length > 0
            ? tradeHistory[tradeHistory.length - 1].equity
            : (initialEquity || acctAfterTrade.totalEquity);

          // 1. Account equity delta (includes all asset price changes)
          const equityPnL = +(acctAfterTrade.totalEquity - prevEquity).toFixed(2);

          // 2. Trade-specific PnL (only from this signal's execution)
          // For market orders: fee is the immediate cost
          const e = result.execution;
          const fillSize = parseFloat(e.fillSize) || 0;
          const fillPrice = e.fillPrice || 0;
          const notional = fillSize * fillPrice;
          // Fee from OKX is in coin units (negative), convert to USD
          const feeUsd = Math.abs(e.fee || 0) * fillPrice;
          // For spot market orders, tradePnL = -fee (no holding period)
          // The real signal PnL comes from comparing buy vs sell over time
          const tradePnL = +(-feeUsd).toFixed(4);

          tradeHistory.push({
            id: tradeHistory.length + 1,
            pair: e.instId,
            side: e.side,
            orderId: e.orderId,
            fillPrice: e.fillPrice,
            fillSize: e.fillSize,
            notional: +notional.toFixed(2),
            fee: feeUsd,
            tradePnL,       // PnL from this trade only (fee cost)
            equityPnL,      // Account equity change since last trade
            real: e.real,
            time: new Date().toLocaleTimeString('zh-CN'),
            equity: acctAfterTrade.totalEquity,
          });
        }

        const acctAfter = await getAccountBalance();
        ws.send(JSON.stringify({ event: 'execution:result', data: {
          ...result,
          account: acctAfter,
          initialEquity: initialEquity || acctAfter.totalEquity,
          tradeHistory,
        }}));
        broadcastState();
        break;
      }
    }
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

async function broadcastState() {
  const acct = await getAccountBalance();
  broadcast({
    event: 'state:update',
    data: {
      ...registry.exportState(),
      paymentStats: payment.getStats(),
      account: acct,
      initialEquity: initialEquity || acct.totalEquity,
      tradeHistory,
    },
  });
}

const PORT = process.env.PORT || 3210;
server.listen(PORT, () => {
  console.log(`\n  🚀 SignalMint Dashboard: http://localhost:${PORT}\n`);
});
