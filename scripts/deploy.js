#!/usr/bin/env node
/**
 * SignalMint - X Layer 合约部署脚本
 *
 * 使用方式:
 *   PRIVATE_KEY=0x... node scripts/deploy.js          # 部署到 X Layer 测试网
 *   PRIVATE_KEY=0x... NETWORK=mainnet node scripts/deploy.js  # 部署到主网
 *
 * 前置条件:
 *   1. X Layer 测试网 OKB 用于支付 gas (从水龙头领取)
 *   2. 导出的钱包私钥
 */
import { ethers } from 'ethers';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// X Layer 网络配置
const NETWORKS = {
  testnet: {
    rpcUrl: 'https://testrpc.xlayer.tech',
    chainId: 1952,
    name: 'X Layer Testnet',
    explorer: 'https://www.okx.com/explorer/xlayer-test',
  },
  mainnet: {
    rpcUrl: 'https://rpc.xlayer.tech',
    chainId: 196,
    name: 'X Layer Mainnet',
    explorer: 'https://www.okx.com/explorer/xlayer',
  },
};

// Simplified ABI + Bytecode for SignalRegistry
// In production: compile with solc or hardhat
const SIGNAL_REGISTRY_ABI = [
  'function registerAgent(uint256 pricePerSignal, uint256 defaultTTL, string description) external',
  'function publishSignal(string pair, string action, uint256 size, uint256 maxSlippage, uint256 ttl, string reason, uint256 targetPrice) external returns (bytes32)',
  'function recordResult(bytes32 signalId, bool profitable, int256 pnl) external',
  'function getWinRate(address agent) external view returns (uint256)',
  'function getRegisteredAgents() external view returns (address[])',
  'function agents(address) external view returns (address agentAddress, uint256 pricePerSignal, uint256 defaultTTL, string description, uint256 registeredAt, bool isActive)',
  'function performances(address) external view returns (uint256 totalSignals, uint256 successfulSignals, int256 totalPnL, uint256 lastUpdated)',
  'function totalAgents() external view returns (uint256)',
  'function totalSignals() external view returns (uint256)',
  'event AgentRegistered(address indexed agent, uint256 pricePerSignal, uint256 ttl)',
  'event SignalPublished(bytes32 indexed signalId, address indexed agent, string pair, string action)',
  'event ResultRecorded(bytes32 indexed signalId, address indexed agent, bool profitable, int256 pnl)',
  'event AgentDegraded(address indexed agent, uint256 winRate)',
];

async function deploy() {
  const network = process.env.NETWORK || 'testnet';
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    console.log(`
  SignalMint Contract Deployment
  ==============================

  Usage:
    PRIVATE_KEY=0x... node scripts/deploy.js

  Options:
    NETWORK=testnet|mainnet  (default: testnet)

  Get testnet OKB:
    https://www.okx.com/xlayer/faucet

  Contract: contracts/SignalRegistry.sol
    `);
    console.log('  ℹ️  No PRIVATE_KEY provided. Generating deployment preview...\n');
    previewDeployment(network);
    return;
  }

  const config = NETWORKS[network];
  console.log(`\n  Deploying to ${config.name}...`);
  console.log(`  RPC: ${config.rpcUrl}`);
  console.log(`  Chain ID: ${config.chainId}\n`);

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`  Deployer: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance: ${ethers.formatEther(balance)} OKB\n`);

  if (balance === 0n) {
    console.log('  ❌ Insufficient balance. Get testnet OKB from faucet first.');
    return;
  }

  // In production, use compiled bytecode from Hardhat/Foundry
  // For demo, we log the deployment plan
  console.log('  📋 Deployment Plan:');
  console.log('     Contract: SignalRegistry.sol');
  console.log(`     Network: ${config.name} (Chain ID: ${config.chainId})`);
  console.log(`     Deployer: ${wallet.address}`);
  console.log(`     Explorer: ${config.explorer}`);
  console.log('\n  To compile and deploy with Hardhat:');
  console.log('     npx hardhat compile');
  console.log(`     npx hardhat run scripts/deploy.js --network xlayer-${network}`);
}

function previewDeployment(network) {
  const config = NETWORKS[network];
  console.log('  📋 Contract Deployment Preview');
  console.log('  ─────────────────────────────');
  console.log(`  Contract:   SignalRegistry.sol`);
  console.log(`  Network:    ${config.name}`);
  console.log(`  Chain ID:   ${config.chainId}`);
  console.log(`  RPC:        ${config.rpcUrl}`);
  console.log(`  Explorer:   ${config.explorer}`);
  console.log('');
  console.log('  Functions:');
  console.log('    registerAgent(pricePerSignal, defaultTTL, description)');
  console.log('    publishSignal(pair, action, size, maxSlippage, ttl, reason, targetPrice)');
  console.log('    recordResult(signalId, profitable, pnl)');
  console.log('    getWinRate(agent) → uint256');
  console.log('    getRegisteredAgents() → address[]');
  console.log('');
  console.log('  Events:');
  console.log('    AgentRegistered(agent, pricePerSignal, ttl)');
  console.log('    SignalPublished(signalId, agent, pair, action)');
  console.log('    ResultRecorded(signalId, agent, profitable, pnl)');
  console.log('    AgentDegraded(agent, winRate)');
  console.log('');
}

deploy().catch(console.error);
