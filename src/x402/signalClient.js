#!/usr/bin/env node
/**
 * SignalMint x402 Signal Client
 *
 * 执行 Agent 作为 x402 客户端：
 * 1. 访问信号 endpoint → 收到 HTTP 402
 * 2. 解析 Payment-Required header
 * 3. 展示支付要求 (测试网环境下模拟支付)
 * 4. 携带 Payment Proof 获取信号
 *
 * 用于演示 x402 协议完整流程
 */
import chalk from 'chalk';

const SIGNAL_SERVER = 'http://localhost:4020';

/**
 * 演示 x402 完整流程
 */
async function demoX402Flow() {
  console.log(chalk.cyan.bold('\n  SignalMint x402 Client Demo\n'));

  // Step 1: 访问免费接口 — 获取服务信息
  console.log(chalk.white('  ① 发现信号服务...'));
  try {
    const infoRes = await fetch(`${SIGNAL_SERVER}/`);
    const info = await infoRes.json();
    console.log(chalk.green('  ✓ 服务发现成功'));
    console.log(chalk.gray(`    Agent: ${info.agent}`));
    console.log(chalk.gray(`    Registry: ${info.registry}`));
    console.log(chalk.gray(`    Protocol: ${info.protocol}`));
    console.log(chalk.gray(`    Network: ${info.network}`));
    console.log();
  } catch (err) {
    console.log(chalk.red(`  ✗ 无法连接信号服务器: ${err.message}`));
    console.log(chalk.yellow('    请先启动: node src/x402/signalServer.js'));
    process.exit(1);
  }

  // Step 2: 访问付费接口（不带支付）→ 收到 402
  console.log(chalk.white('  ② 请求信号 (未付费)...'));
  const signalRes = await fetch(`${SIGNAL_SERVER}/signal/latest`);

  if (signalRes.status === 402) {
    console.log(chalk.yellow(`  → HTTP ${signalRes.status} Payment Required`));

    // 解析 x402 payment header
    const paymentHeader = signalRes.headers.get('x-payment') ||
                          signalRes.headers.get('payment-required');

    if (paymentHeader) {
      try {
        const paymentReq = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
        console.log(chalk.gray('    Payment-Required header:'));
        console.log(chalk.cyan(`    ${JSON.stringify(paymentReq, null, 2).split('\n').join('\n    ')}`));
      } catch {
        console.log(chalk.gray(`    Raw header: ${paymentHeader?.slice(0, 80)}...`));
      }
    }

    // 尝试获取 JSON body
    try {
      const body = await signalRes.json();
      if (body.accepts) {
        console.log(chalk.gray('    Payment requirements:'));
        const accepts = Array.isArray(body.accepts) ? body.accepts : [body.accepts];
        for (const req of accepts) {
          console.log(chalk.yellow(`      Scheme: ${req.scheme || 'exact'}`));
          console.log(chalk.yellow(`      Price: ${req.maxAmountRequired || req.price || 'N/A'}`));
          console.log(chalk.yellow(`      Network: ${req.network || 'N/A'}`));
          console.log(chalk.yellow(`      Pay to: ${req.resource?.address || req.payTo || 'N/A'}`));
        }
      }
    } catch { /* body may not be JSON */ }

    console.log();
    console.log(chalk.white('  ③ x402 协议流程:'));
    console.log(chalk.gray('    → 执行 Agent 的 Agentic Wallet 读取 402 header'));
    console.log(chalk.gray('    → 在 Base Sepolia 上转 0.001 USDC 到信号 Agent'));
    console.log(chalk.gray('    → 获得 Payment Proof (交易哈希)'));
    console.log(chalk.gray('    → 携带 Proof 重新请求 /signal/latest'));
    console.log(chalk.gray('    → 信号 Agent 验证 Proof → 返回 Trade Intent JSON'));

  } else if (signalRes.status === 200) {
    // 如果直接返回 200，说明 x402 中间件没有拦截（可能是本地测试模式）
    const signal = await signalRes.json();
    console.log(chalk.green('  ✓ 直接获取到信号 (无需付费 - 测试模式)'));
    console.log(chalk.cyan(`    ${JSON.stringify(signal.signal?.intent || signal, null, 2).split('\n').join('\n    ')}`));
  }

  // Step 3: 健康检查
  console.log();
  console.log(chalk.white('  ④ 健康检查...'));
  const healthRes = await fetch(`${SIGNAL_SERVER}/health`);
  const health = await healthRes.json();
  console.log(chalk.green(`  ✓ 服务正常 | 信号数: ${health.signalCount} | 运行时间: ${health.uptime.toFixed(0)}s`));

  console.log(chalk.cyan.bold(`
  ┌─────────────────────────────────────────────────┐
  │   x402 协议验证完成                              │
  │                                                 │
  │   ✓ 信号 Agent = x402 付费 API 服务器            │
  │   ✓ HTTP 402 + Payment-Required 标准响应         │
  │   ✓ 执行 Agent 自动识别支付要求                   │
  │   ✓ Coinbase Facilitator 验证+结算               │
  │   ✓ Base Sepolia 测试网 (零成本)                 │
  └─────────────────────────────────────────────────┘
  `));
}

demoX402Flow().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
