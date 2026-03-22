import crypto from 'crypto';
import { ProxyAgent } from 'undici';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const API_KEY = process.env.OKX_API_KEY;
const SECRET = process.env.OKX_SECRET_KEY;
const PASS = process.env.OKX_PASSPHRASE;
if (!API_KEY || !SECRET || !PASS) { console.error('Missing OKX credentials in .env'); process.exit(1); }
const BASE = 'https://www.okx.com';
const PROXY = process.env.https_proxy || process.env.http_proxy || 'http://127.0.0.1:7890';

function sign(timestamp, method, path, body = '') {
  return crypto.createHmac('sha256', SECRET).update(timestamp + method + path + body).digest('base64');
}

async function okxApi(method, path, body = null) {
  const ts = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : '';

  const headers = {
    'OK-ACCESS-KEY': API_KEY,
    'OK-ACCESS-SIGN': sign(ts, method, path, bodyStr),
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': PASS,
    'x-simulated-trading': '1',
    'Content-Type': 'application/json',
  };

  const opts = { method, headers, dispatcher: new ProxyAgent(PROXY) };
  if (body) opts.body = bodyStr;

  const res = await fetch(BASE + path, opts);
  return res.json();
}

// Test 1: Account balance
console.log('=== 模拟盘账户余额 ===');
const balance = await okxApi('GET', '/api/v5/account/balance');
if (balance.code === '0' && balance.data?.[0]) {
  const details = balance.data[0].details;
  console.log('Total equity:', balance.data[0].totalEq, 'USD');
  details?.forEach(d => {
    if (parseFloat(d.availBal) > 0) {
      console.log(`  ${d.ccy}: ${d.availBal}`);
    }
  });
} else {
  console.log('Error:', balance.msg || JSON.stringify(balance));
}

// Test 2: Place demo market order
console.log('\n=== 模拟盘下单测试 ===');
const order = await okxApi('POST', '/api/v5/trade/order', {
  instId: 'BTC-USDT',
  tdMode: 'cash',
  side: 'buy',
  ordType: 'market',
  sz: '10',  // 10 USDT market buy
  tgtCcy: 'quote_ccy',
});

if (order.code === '0') {
  const o = order.data[0];
  console.log('✓ 下单成功!');
  console.log('  订单 ID:', o.ordId);
  console.log('  clOrdId:', o.clOrdId);

  // Check order status
  await new Promise(r => setTimeout(r, 1000));
  const detail = await okxApi('GET', `/api/v5/trade/order?instId=BTC-USDT&ordId=${o.ordId}`);
  if (detail.code === '0' && detail.data?.[0]) {
    const d = detail.data[0];
    console.log('  状态:', d.state);
    console.log('  成交价:', d.avgPx);
    console.log('  成交量:', d.accFillSz);
    console.log('  手续费:', d.fee, d.feeCcy);
  }
} else {
  console.log('✗ 下单失败:', order.msg || JSON.stringify(order));
}
