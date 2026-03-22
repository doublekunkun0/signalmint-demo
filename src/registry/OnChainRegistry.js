/**
 * OnChainRegistry - 真实链上注册表交互
 * 调用 X Layer 测试网上已部署的 SignalRegistry 合约
 *
 * 合约: 0x26e39a1C95857BDeB8570a7375822B525DcDb1D6
 * 链: X Layer Testnet (Chain ID 1952)
 */
import { ethers } from 'ethers';
import { CONFIG } from '../config.js';

const CONTRACT_ABI = [
  'function registerAgent(uint256 pricePerSignal, uint256 defaultTTL, string description) external',
  'function publishSignal(string pair, string action, uint256 size, uint256 maxSlippage, uint256 ttl, string reason, uint256 targetPrice) external returns (bytes32)',
  'function recordResult(bytes32 signalId, bool profitable, int256 pnl) external',
  'function getWinRate(address agent) external view returns (uint256)',
  'function getRegisteredAgents() external view returns (address[])',
  'function getAgentSignals(address agent) external view returns (bytes32[])',
  'function isSignalValid(bytes32 signalId) external view returns (bool)',
  'function totalAgents() external view returns (uint256)',
  'function totalSignals() external view returns (uint256)',
  'function agents(address) external view returns (address agentAddress, uint256 pricePerSignal, uint256 defaultTTL, string description, uint256 registeredAt, bool isActive)',
  'function signals(bytes32) external view returns (bytes32 signalId, address agentAddress, string pair, string action, uint256 size, uint256 maxSlippage, uint256 ttl, string reason, uint256 targetPrice, uint256 createdAt, bool isExpired)',
  'function performances(address) external view returns (uint256 totalSignals, uint256 successfulSignals, int256 totalPnL, uint256 lastUpdated)',
  'event AgentRegistered(address indexed agent, uint256 pricePerSignal, uint256 ttl)',
  'event SignalPublished(bytes32 indexed signalId, address indexed agent, string pair, string action)',
  'event ResultRecorded(bytes32 indexed signalId, address indexed agent, bool profitable, int256 pnl)',
  'event AgentDegraded(address indexed agent, uint256 winRate)',
];

export class OnChainRegistry {
  constructor(privateKey) {
    this.provider = new ethers.JsonRpcProvider(CONFIG.xLayer.rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(CONFIG.registry.address, CONTRACT_ABI, this.wallet);
    this.txCount = 0;
  }

  /**
   * 发布信号 + 回写结果（两步合一）
   * 1. publishSignal() → 获得链上 signalId
   * 2. recordResult(signalId, profitable, pnl)
   */
  async recordResult(profitable, pnl, tradeInfo = {}) {
    try {
      const pair = tradeInfo.pair || 'BTC-USDT';
      const action = tradeInfo.side || 'buy';
      const reason = tradeInfo.reason || 'auto signal';

      // Step 1: publishSignal on-chain
      const pubTx = await this.contract.publishSignal(
        pair, action,
        100000,     // size scaled
        2000,       // maxSlippage 0.2%
        60,         // ttl
        reason,
        Math.round((tradeInfo.fillPrice || 0) * 100)
      );
      const pubReceipt = await pubTx.wait();

      // Extract signalId from event logs
      let signalId = null;
      for (const log of pubReceipt.logs) {
        try {
          const parsed = this.contract.interface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
          if (parsed?.name === 'SignalPublished') {
            signalId = parsed.args[0]; // signalId is first indexed arg
            break;
          }
        } catch { /* skip non-matching logs */ }
      }

      // Fallback: signalId is the first indexed topic (topic[1])
      if (!signalId && pubReceipt.logs.length > 0) {
        signalId = pubReceipt.logs[0].topics[1];
      }

      if (!signalId) {
        return { success: false, error: 'Could not extract signalId from event' };
      }

      // Wait for RPC to sync
      await new Promise(r => setTimeout(r, 1500));

      // Step 2: recordResult on-chain
      const pnlScaled = Math.round(pnl * 100);
      const recTx = await this.contract.recordResult(signalId, profitable, pnlScaled);
      const recReceipt = await recTx.wait();

      return {
        success: true,
        publishTx: pubReceipt.hash,
        resultTx: recReceipt.hash,
        blockNumber: recReceipt.blockNumber,
        gasUsed: (BigInt(pubReceipt.gasUsed) + BigInt(recReceipt.gasUsed)).toString(),
        signalId,
        profitable,
        pnl,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message.slice(0, 120),
      };
    }
  }

  /**
   * 查询链上胜率
   */
  async getWinRate() {
    try {
      const rate = await this.contract.getWinRate(this.wallet.address);
      return { winRate: Number(rate) / 10000, raw: Number(rate) }; // rate is scaled by 10000 (e.g. 6500 = 65%)
    } catch {
      return { winRate: 0, raw: 0 };
    }
  }

  /**
   * 查询链上绩效
   */
  async getPerformance() {
    try {
      const perf = await this.contract.performances(this.wallet.address);
      return {
        totalSignals: Number(perf.totalSignals),
        successfulSignals: Number(perf.successfulSignals),
        totalPnL: Number(perf.totalPnL) / 100,
        lastUpdated: Number(perf.lastUpdated),
      };
    } catch {
      return null;
    }
  }

  /**
   * 查询合约统计
   */
  async getStats() {
    try {
      const [agents, signals] = await Promise.all([
        this.contract.totalAgents(),
        this.contract.totalSignals(),
      ]);
      return { totalAgents: Number(agents), totalSignals: Number(signals) };
    } catch {
      return null;
    }
  }
}
