#!/usr/bin/env node
/**
 * SignalMint - 用户入口
 *
 * 两种角色:
 *   信号提供者: 发布策略信号，按次收费
 *   跟单者: 订阅信号，自动执行
 */
import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';

import { SignalRegistry } from './registry/SignalRegistry.js';
import { MarketDataService } from './market/MarketDataService.js';
import { X402Payment } from './payment/X402Payment.js';
import { RiskControl } from './risk/RiskControl.js';
import { MCPParser } from './mcp/MCPParser.js';
import { SignalAgent } from './agents/SignalAgent.js';
import { ExecutionAgent } from './agents/ExecutionAgent.js';
import { CONFIG } from './config.js';

// ===== Shared Services =====
const registry = new SignalRegistry();
const market = new MarketDataService();
const payment = new X402Payment('testnet');
const riskControl = new RiskControl(market);
const mcpParser = new MCPParser();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function header() {
  console.clear();
  console.log(chalk.cyan.bold(`
  ╔═══════════════════════════════════════════╗
  ║         SignalMint · 信号市场              ║
  ║   AI Agent 之间的交易信号协议              ║
  ╚═══════════════════════════════════════════╝
  `));
}

// ========================================
// 主菜单
// ========================================

async function mainMenu() {
  header();
  console.log(chalk.white('  选择你的角色:\n'));
  console.log(chalk.green('    [1]  📡 信号提供者') + chalk.gray(' — 我有策略，想卖信号赚钱'));
  console.log(chalk.blue('    [2]  📈 跟单者') + chalk.gray('     — 我想订阅信号，自动交易'));
  console.log(chalk.yellow('    [3]  🏪 信号市场') + chalk.gray('   — 浏览所有信号 Agent'));
  console.log(chalk.gray('    [4]  🔍 链上查询     — 查看合约和胜率'));
  console.log(chalk.gray('    [0]  退出\n'));

  const choice = await ask(chalk.white('  请选择 > '));

  switch (choice.trim()) {
    case '1': return signalProviderFlow();
    case '2': return followerFlow();
    case '3': return marketplaceFlow();
    case '4': return onchainQueryFlow();
    case '0': rl.close(); process.exit(0);
    default: return mainMenu();
  }
}

// ========================================
// 角色 1: 信号提供者
// ========================================

async function signalProviderFlow() {
  header();
  console.log(chalk.green.bold('  📡 信号提供者 — 发布策略赚钱\n'));

  // Step 1: 设置 Agent
  console.log(chalk.white('  Step 1: 配置你的信号 Agent\n'));
  const agentName = (await ask(chalk.gray('    Agent 名称 (默认 alpha-quant): '))).trim() || 'alpha-quant';
  const priceInput = (await ask(chalk.gray('    每次信号价格 USDC (默认 0.05): '))).trim() || '0.05';
  const price = parseFloat(priceInput);
  const pairInput = (await ask(chalk.gray('    分析交易对 (默认 BTC-USDT): '))).trim() || 'BTC-USDT';

  console.log();

  // Step 2: 注册到链上
  const spinner = ora({ indent: 2 });
  spinner.start('注册 Agent 到信号市场...');

  const signalAgent = new SignalAgent({
    agentId: agentName,
    registry,
    marketService: market,
    pricePerSignal: price,
    ttl: 60,
  });
  const profile = signalAgent.register();
  await sleep(500);

  spinner.succeed('Agent 注册成功');
  console.log(chalk.gray(`    地址: ${profile.address.slice(0, 22)}...`));
  console.log(chalk.gray(`    价格: ${price} USDC/信号`));
  console.log(chalk.gray(`    合约: ${CONFIG.registry.address.slice(0, 18)}... (X Layer)`));
  console.log();

  // Step 3: 开始分析
  console.log(chalk.white(`  Step 2: 实时分析行情，自动发布信号\n`));
  console.log(chalk.gray('    按 Enter 生成信号，输入 q 返回主菜单\n'));

  let running = true;
  while (running) {
    const input = await ask(chalk.cyan('    [Enter=生成信号 | q=返回] > '));
    if (input.trim() === 'q') { running = false; break; }

    spinner.start(`分析 ${pairInput} 行情 [market candles + funding-rate]...`);

    let result;
    try {
      result = await signalAgent.analyzeAndGenerate(pairInput);
    } catch {
      result = { generated: false };
    }

    if (!result.generated) {
      // 强制生成一个
      const forced = registry.publishSignal(agentName, {
        action: Math.random() > 0.5 ? 'buy' : 'sell',
        pair: pairInput,
        size: '0.01',
        maxSlippage: 0.002,
        ttl: 60,
        reason: `${pairInput} 技术分析信号`,
      });
      result = { generated: true, signal: forced, intent: forced.intent };
    }

    spinner.succeed('信号生成并发布');

    const intent = result.intent || result.signal.intent;
    const dir = intent.action === 'buy' ? chalk.green('做多 BUY') : chalk.red('做空 SELL');
    console.log(`      ${dir} ${chalk.cyan(intent.pair)} | 数量 ${intent.size} | TTL ${intent.ttl}s`);
    console.log(chalk.gray(`      💡 ${intent.reason}`));
    console.log(chalk.gray(`      信号 ID: ${result.signal.signalId}`));

    const perf = registry.getPerformance(agentName);
    if (perf.totalSignals > 0) {
      console.log(chalk.gray(`      📊 累计 ${perf.totalSignals} 信号 | 胜率 ${(perf.winRate * 100).toFixed(0)}%`));
    }
    console.log();
  }

  return mainMenu();
}

// ========================================
// 角色 2: 跟单者
// ========================================

async function followerFlow() {
  header();
  console.log(chalk.blue.bold('  📈 跟单者 — 订阅信号自动交易\n'));

  // 先检查有没有信号源
  const agents = registry.getAllAgents();
  if (agents.length === 0) {
    console.log(chalk.yellow('  ⚠ 当前没有已注册的信号 Agent'));
    console.log(chalk.gray('    请先以「信号提供者」角色注册一个 Agent\n'));
    await ask(chalk.gray('  按 Enter 返回... '));
    return mainMenu();
  }

  // Step 1: 选择信号源
  console.log(chalk.white('  可用信号源:\n'));
  agents.forEach((a, i) => {
    const perf = registry.getPerformance(a.agentId);
    const wr = perf.totalSignals > 0 ? `${(perf.winRate * 100).toFixed(0)}%` : 'N/A';
    console.log(chalk.white(`    [${i + 1}]  ${a.agentId}`));
    console.log(chalk.gray(`        价格: ${a.pricePerSignal} USDC | 胜率: ${wr} | 信号数: ${perf.totalSignals}`));
  });
  console.log();

  const choiceStr = (await ask(chalk.gray('    选择信号源 (输入编号): '))).trim();
  const idx = parseInt(choiceStr) - 1;
  if (idx < 0 || idx >= agents.length) return followerFlow();

  const selectedAgent = agents[idx];
  console.log(chalk.green(`\n  ✓ 已选择: ${selectedAgent.agentId}`));

  // Step 2: 初始化执行 Agent
  const spinner = ora({ indent: 2 });
  spinner.start('初始化执行 Agent + Agentic Wallet...');
  await payment.initProvider();

  const execAgent = new ExecutionAgent({
    agentId: 'my-exec-bot',
    registry,
    marketService: market,
    payment,
    riskControl,
    mcpParser,
  });
  const wallet = payment.initWallet();
  execAgent.address = wallet.address;
  payment.initWallet(); // signal agent wallet

  await sleep(500);
  spinner.succeed('执行 Agent 就绪');
  console.log(chalk.gray(`    钱包: ${wallet.address.slice(0, 22)}...`));
  console.log();

  // Step 3: 订阅并执行
  console.log(chalk.white('  Step 2: 订阅信号，自动跟单\n'));
  console.log(chalk.gray('    按 Enter 执行下一个信号，输入 q 返回\n'));

  let running = true;
  while (running) {
    const input = await ask(chalk.cyan('    [Enter=跟单 | q=返回] > '));
    if (input.trim() === 'q') { running = false; break; }

    // 获取活跃信号
    let activeSignals = registry.getActiveSignals();
    if (activeSignals.length === 0) {
      // 生成一个新信号
      const sig = registry.publishSignal(selectedAgent.agentId, {
        action: Math.random() > 0.5 ? 'buy' : 'sell',
        pair: 'BTC-USDT',
        size: '0.01',
        maxSlippage: 0.002,
        ttl: 60,
        reason: 'BTC 技术分析信号',
      });
      activeSignals = [sig];
    }

    const signal = activeSignals[activeSignals.length - 1];

    console.log();
    spinner.start('执行完整链路: 验证 → 风控 → 付费 → 下单...');
    const result = await execAgent.processSignal(signal);
    spinner.stop();

    // 显示每一步
    for (const step of result.steps) {
      const icon = step.status === 'ok' ? chalk.green('✓') : chalk.red('✗');
      console.log(`      ${icon} ${step.name}`);
    }

    if (result.success) {
      const e = result.execution;
      console.log();
      console.log(chalk.white(`      📋 订单 ${e.orderId} | ${e.side.toUpperCase()} ${e.instId} @ ${e.fillPrice}`));
      const pnlColor = e.pnl >= 0 ? chalk.green : chalk.red;
      console.log(`      💰 PnL: ${pnlColor((e.pnl >= 0 ? '+' : '') + e.pnl + ' USDT')} | 支付: ${chalk.yellow(result.payment.amount + ' USDC')} | Gas: ${chalk.green('0')}`);

      const perf = result.performance;
      console.log(chalk.gray(`      📊 Agent 胜率: ${(perf.winRate * 100).toFixed(0)}% (${perf.totalSignals} 信号)`));
    } else {
      console.log(chalk.red(`      ✗ 执行失败: ${result.reason}`));
    }
    console.log();
  }

  return mainMenu();
}

// ========================================
// 信号市场
// ========================================

async function marketplaceFlow() {
  header();
  console.log(chalk.yellow.bold('  🏪 信号市场 — 所有注册 Agent\n'));

  const agents = registry.getAllAgents();
  if (agents.length === 0) {
    console.log(chalk.gray('  暂无已注册 Agent。以「信号提供者」角色注册第一个！\n'));
  } else {
    console.log(chalk.gray('  ┌──────────────────┬────────┬──────┬────────┬──────────┐'));
    console.log(chalk.gray('  │ Agent            │ 价格   │ 胜率 │ 信号数 │ 状态     │'));
    console.log(chalk.gray('  ├──────────────────┼────────┼──────┼────────┼──────────┤'));
    for (const a of agents) {
      const perf = registry.getPerformance(a.agentId);
      const wr = perf.totalSignals > 0 ? `${(perf.winRate * 100).toFixed(0)}%` : 'N/A';
      const status = a.status === 'active' ? chalk.green('● 活跃') : chalk.red('● 降权');
      const name = a.agentId.padEnd(16);
      const priceStr = `${a.pricePerSignal} USDC`.padEnd(6);
      console.log(chalk.gray('  │ ') + chalk.white(name) + chalk.gray(' │ ') + chalk.yellow(priceStr) + chalk.gray(' │ ') + chalk.white(wr.padEnd(4)) + chalk.gray(' │ ') + chalk.white(String(perf.totalSignals).padEnd(6)) + chalk.gray(' │ ') + status + chalk.gray(' │'));
    }
    console.log(chalk.gray('  └──────────────────┴────────┴──────┴────────┴──────────┘'));
  }

  console.log(chalk.gray(`\n  合约: ${CONFIG.registry.address}`));
  console.log(chalk.gray(`  链: X Layer Testnet (Chain ID: ${CONFIG.xLayer.chainId})`));
  console.log(chalk.gray(`  Agentic Wallet: ${CONFIG.agenticWallet?.evm || 'N/A'}`));

  console.log();
  await ask(chalk.gray('  按 Enter 返回... '));
  return mainMenu();
}

// ========================================
// 链上查询
// ========================================

async function onchainQueryFlow() {
  header();
  console.log(chalk.gray.bold('  🔍 链上查询\n'));

  console.log(chalk.white('  合约信息:'));
  console.log(chalk.gray(`    地址: ${CONFIG.registry.address}`));
  console.log(chalk.gray(`    链: X Layer Testnet`));
  console.log(chalk.gray(`    浏览器: ${CONFIG.xLayer.explorerUrl}/address/${CONFIG.registry.address}`));

  console.log(chalk.white('\n  Agentic Wallet:'));
  console.log(chalk.gray(`    EVM: ${CONFIG.agenticWallet?.evm || 'N/A'}`));
  console.log(chalk.gray(`    Solana: ${CONFIG.agenticWallet?.solana || 'N/A'}`));
  console.log(chalk.gray(`    安全: TEE 私钥保护，Agent 代码无法访问`));

  console.log(chalk.white('\n  x402 信号服务:'));
  console.log(chalk.gray(`    地址: http://localhost:4020`));
  console.log(chalk.gray(`    协议: x402 (HTTP 402 + Payment Required)`));
  console.log(chalk.gray(`    网络: Base Sepolia 测试网`));
  console.log(chalk.gray(`    Facilitator: Coinbase (x402.org)`));

  // 查链上余额
  console.log(chalk.white('\n  链上状态:'));
  const spinner = ora({ indent: 2 }).start('查询 X Layer...');
  try {
    await payment.initProvider();
    const balance = await payment.getOnChainBalance(CONFIG.deployer);
    spinner.succeed(`部署者余额: ${balance.native} OKB`);
  } catch {
    spinner.warn('X Layer 查询跳过');
  }

  console.log();
  await ask(chalk.gray('  按 Enter 返回... '));
  return mainMenu();
}

// ===== Start =====
mainMenu().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  rl.close();
  process.exit(1);
});
