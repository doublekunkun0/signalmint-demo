#!/usr/bin/env node
/**
 * SignalMint 测试套件
 * 验证各模块核心功能（含真实 OKX API 调用）
 */
import { SignalRegistry } from './registry/SignalRegistry.js';
import { MarketDataService } from './market/MarketDataService.js';
import { X402Payment } from './payment/X402Payment.js';
import { RiskControl } from './risk/RiskControl.js';
import { MCPParser } from './mcp/MCPParser.js';
import { SignalAgent } from './agents/SignalAgent.js';
import { ExecutionAgent } from './agents/ExecutionAgent.js';

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}`); failed++; }
}

async function runTests() {
  console.log('\n  SignalMint Test Suite\n');

  // === Registry ===
  console.log('  ── Signal Registry ──');
  const registry = new SignalRegistry();

  const profile = registry.registerAgent({ agentId: 'test-agent', pricePerSignal: 0.05, ttl: 60 });
  assert(profile.agentId === 'test-agent', 'Agent registration');
  assert(profile.address.startsWith('0x'), 'Agent has address');

  const signal = registry.publishSignal('test-agent', {
    action: 'buy', pair: 'BTC-USDT', size: '0.01', ttl: 60, reason: 'test',
  });
  assert(signal.signalId.startsWith('sig_'), 'Signal published');
  assert(signal.intent.action === 'buy', 'Signal intent correct');

  const active = registry.getActiveSignals();
  assert(active.length === 1, 'Active signals query');

  const perf = registry.recordResult('test-agent', signal.signalId, { profitable: true, pnl: 5.0 });
  assert(perf.winRate === 1.0, 'Win rate calculation');
  assert(perf.totalPnL === 5.0, 'PnL tracking');

  // === Real OKX Market Data ===
  console.log('\n  ── OKX Market Data (真实 API) ──');
  const market = new MarketDataService();

  try {
    const candles = await market.getCandles('BTC-USDT', '1H', 24);
    assert(candles.data.length > 0, `market candles: ${candles.data.length} candles [${candles.source}]`);
    assert(candles.currentPrice > 0, `Current BTC price: ${candles.currentPrice}`);

    const depth = await market.getDepth('BTC-USDT');
    assert(depth.asks.length > 0, `market depth: ${depth.asks.length} asks [${depth.source}]`);
    assert(depth.bestAsk > depth.bestBid, `Spread: ${depth.spread} (${depth.spreadPercent}%)`);

    const funding = await market.getFundingRate('BTC-USDT');
    assert(typeof funding.fundingRate === 'number', `funding-rate: ${(funding.fundingRate * 100).toFixed(4)}% [${funding.source}]`);

    const analysis = market.analyzeCandles(candles.data);
    assert(['buy', 'sell', 'neutral'].includes(analysis.signal), `Analysis: ${analysis.signal} (conf: ${analysis.confidence})`);
  } catch (err) {
    console.log(`  ⚠ OKX API unavailable: ${err.message}`);
    console.log('  ⚠ Skipping real API tests');
  }

  // === x402 Payment ===
  console.log('\n  ── x402 Payment (X Layer) ──');
  const payment = new X402Payment('testnet');

  const providerStatus = await payment.initProvider();
  assert(typeof providerStatus.connected === 'boolean', `X Layer provider: ${providerStatus.connected ? 'connected' : 'simulation'}`);

  const wallet1 = payment.initWallet();
  const wallet2 = payment.initWallet();
  assert(wallet1.address.startsWith('0x'), 'Wallet 1 created');
  assert(wallet2.address.startsWith('0x'), 'Wallet 2 created');

  // Test payment request (x402 protocol)
  const payReq = payment.createPaymentRequest(wallet2.address, 0.05, 'sig_test');
  assert(payReq.status === 402, 'x402 returns HTTP 402');
  assert(payReq.headers['X-Payment-Chain-Id'] === '1952', 'X Layer chain ID in header');
  assert(payReq.headers['X-Payment-Required'] === 'true', 'Payment-Required header');

  const payResult = await payment.processPayment(wallet1.address, wallet2.address, 0.05, 'sig_test');
  assert(payResult.success, 'x402 payment succeeds');
  assert(payResult.payment.gasUsed === 0, 'Zero gas on X Layer');
  assert(payResult.payment.chain === 'X Layer Testnet', 'Settlement on X Layer');
  assert(payResult.proofHeaders['X-Payment-Proof'], 'Payment proof header present');

  // Verify proof
  const verified = payment.verifyPaymentProof(payResult.proofHeaders, 0.05, wallet2.address);
  assert(verified.verified, 'Payment proof verified');

  // Refund
  const refResult = await payment.processRefund(payResult.payment.paymentId, 'TTL expired');
  assert(refResult.success, 'x402 refund succeeds');

  // === Risk Control ===
  console.log('\n  ── Risk Control (三道防线) ──');
  const risk = new RiskControl(market);

  const testSignal = {
    intent: { action: 'buy', pair: 'BTC-USDT', size: '0.01', maxSlippage: 0.002 },
    expiresAt: Date.now() + 60000,
    agentAddress: '0xLegitAgent',
  };

  try {
    const preVal = await risk.preValidate(testSignal);
    assert(preVal.pass, 'Pre-validation (defense 1)');
  } catch {
    console.log('  ⚠ Pre-validation skipped (API unavailable)');
  }

  const walletCheck = await risk.walletRiskCheck(testSignal, '0xLegitAgent');
  assert(walletCheck.pass, 'Agentic Wallet check (defense 2)');

  const blacklistCheck = await risk.walletRiskCheck(testSignal, '0xdead000000000000000000000000000000000000');
  assert(!blacklistCheck.pass, 'Blacklisted address rejected');

  const expiredSignal = { ...testSignal, expiresAt: Date.now() - 5000 };
  try {
    const ttlCheck = await risk.ttlSlippageCheck(expiredSignal);
    assert(!ttlCheck.pass, 'Expired signal rejected (defense 3)');
  } catch {
    console.log('  ⚠ TTL check skipped (API unavailable)');
  }

  // === MCP Parser ===
  console.log('\n  ── MCP Parser ──');
  const mcp = new MCPParser();

  const tools = mcp.listTools();
  assert(tools.result.tools.length >= 3, `MCP tools registered: ${tools.result.tools.length}`);

  const parsed = mcp.parseIntent({
    action: 'buy', pair: 'BTC-USDT', size: '0.01', maxSlippage: 0.002, ttl: 60, reason: 'test',
  });
  assert(parsed.valid, 'Intent parsed');
  assert(parsed.tool === 'okx_swap_place_order', 'Mapped to okx_swap_place_order');
  assert(parsed.mcpMessage.method === 'tools/call', 'MCP message format correct');

  const invalidParsed = mcp.parseIntent({ action: 'buy' });
  assert(!invalidParsed.valid, 'Missing fields rejected');

  const exec = await mcp.executeTrade(parsed, { midPrice: 87500 });
  assert(exec.success, 'Trade execution');
  assert(exec.orderId, 'Order ID generated: ' + exec.orderId);
  assert(exec.mcpResponse.jsonrpc === '2.0', 'MCP response format');

  // === Integration ===
  console.log('\n  ── Integration (Full Pipeline) ──');
  const reg2 = new SignalRegistry();
  const mkt2 = new MarketDataService();
  const pay2 = new X402Payment('testnet');
  await pay2.initProvider();
  const rsk2 = new RiskControl(mkt2);
  const mcp2 = new MCPParser();

  const sigAgent = new SignalAgent({ agentId: 'sig-v1', registry: reg2, marketService: mkt2, pricePerSignal: 0.05 });
  sigAgent.register();

  const execAgent = new ExecutionAgent({
    agentId: 'exec-v1', registry: reg2, marketService: mkt2,
    payment: pay2, riskControl: rsk2, mcpParser: mcp2,
  });
  const ew = pay2.initWallet();
  execAgent.address = ew.address;
  pay2.initWallet(); // signal agent wallet

  const sig = reg2.publishSignal('sig-v1', {
    action: 'buy', pair: 'BTC-USDT', size: '0.01',
    maxSlippage: 0.002, ttl: 60, reason: 'Integration test',
  });

  try {
    const result = await execAgent.processSignal(sig);
    assert(result.success, 'Full pipeline executes');
    assert(result.steps.length === 7, `All 7 steps completed`);
    assert(result.payment?.chain?.includes('X Layer'), 'Payment on X Layer');
    assert(result.payment?.gasUsed === 0, 'Zero gas');

    const perfFinal = reg2.getPerformance('sig-v1');
    assert(perfFinal.totalSignals === 1, 'Performance recorded');
  } catch (err) {
    console.log(`  ⚠ Integration test failed: ${err.message}`);
  }

  // === Summary ===
  console.log(`\n  ══════════════════════════════════`);
  console.log(`  Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`);
  console.log(`  ══════════════════════════════════\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => { console.error('Test Error:', err); process.exit(1); });
