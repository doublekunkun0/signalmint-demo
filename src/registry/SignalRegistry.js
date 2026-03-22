/**
 * SignalRegistry - 信号注册表
 * 模拟 X Layer 链上合约，负责信号发现与信任
 *
 * 职责：
 * 1. 信号 Agent 注册（地址、价格、TTL）
 * 2. 信号发布与查询
 * 3. 链上胜率统计与更新
 */
import { EventEmitter } from 'events';
import crypto from 'crypto';

export class SignalRegistry extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();       // agentId -> AgentProfile
    this.signals = new Map();      // signalId -> Signal
    this.performances = new Map(); // agentId -> PerformanceStats
    this.contractAddress = '0x' + crypto.randomBytes(20).toString('hex');
    this.blockNumber = 1000;
  }

  /**
   * 注册信号 Agent
   */
  registerAgent({ agentId, address, pricePerSignal, ttl, description }) {
    const profile = {
      agentId,
      address: address || '0x' + crypto.randomBytes(20).toString('hex'),
      pricePerSignal: pricePerSignal || 0.05,
      defaultTTL: ttl || 60,
      description: description || '',
      registeredAt: Date.now(),
      blockNumber: this.blockNumber++,
      status: 'active',
    };

    this.agents.set(agentId, profile);

    // Initialize performance stats
    this.performances.set(agentId, {
      totalSignals: 0,
      successfulSignals: 0,
      failedSignals: 0,
      totalPnL: 0,
      avgPnL: 0,
      winRate: 0,
      lastUpdated: Date.now(),
    });

    this.emit('agent:registered', profile);
    return profile;
  }

  /**
   * 发布信号到注册表
   */
  publishSignal(agentId, signalData) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not registered`);
    if (agent.status !== 'active') throw new Error(`Agent ${agentId} is ${agent.status}`);

    const signalId = 'sig_' + crypto.randomBytes(8).toString('hex');
    const signal = {
      signalId,
      agentId,
      agentAddress: agent.address,
      price: agent.pricePerSignal,
      createdAt: Date.now(),
      expiresAt: Date.now() + (signalData.ttl || agent.defaultTTL) * 1000,
      blockNumber: this.blockNumber++,
      status: 'active',
      // Standard Trade Intent JSON
      intent: {
        action: signalData.action,       // 'buy' | 'sell'
        pair: signalData.pair,           // 'BTC-USDT'
        size: signalData.size,           // '0.01'
        maxSlippage: signalData.maxSlippage || 0.002,
        ttl: signalData.ttl || agent.defaultTTL,
        reason: signalData.reason || '',
        targetPrice: signalData.targetPrice || null,
        stopLoss: signalData.stopLoss || null,
      },
      txHash: '0x' + crypto.randomBytes(32).toString('hex'),
    };

    this.signals.set(signalId, signal);
    this.emit('signal:published', signal);
    return signal;
  }

  /**
   * 查询活跃信号
   */
  getActiveSignals(filterPair = null) {
    const now = Date.now();
    const active = [];
    for (const [, signal] of this.signals) {
      if (signal.status === 'active' && signal.expiresAt > now) {
        if (!filterPair || signal.intent.pair === filterPair) {
          active.push(signal);
        }
      }
    }
    return active;
  }

  /**
   * 获取信号详情
   */
  getSignal(signalId) {
    return this.signals.get(signalId) || null;
  }

  /**
   * 标记信号已过期
   */
  expireSignal(signalId) {
    const signal = this.signals.get(signalId);
    if (signal) {
      signal.status = 'expired';
      this.emit('signal:expired', signal);
    }
  }

  /**
   * 回写执行结果，更新胜率
   */
  recordResult(agentId, signalId, result) {
    const perf = this.performances.get(agentId);
    if (!perf) throw new Error(`Agent ${agentId} not found`);

    const signal = this.signals.get(signalId);
    if (signal) {
      signal.status = result.profitable ? 'success' : 'failed';
      signal.executionResult = result;
    }

    perf.totalSignals++;
    if (result.profitable) {
      perf.successfulSignals++;
    } else {
      perf.failedSignals++;
    }
    perf.totalPnL += result.pnl || 0;
    perf.avgPnL = perf.totalPnL / perf.totalSignals;
    perf.winRate = perf.successfulSignals / perf.totalSignals;
    perf.lastUpdated = Date.now();

    // Auto-downgrade agents with persistently low win rate
    if (perf.totalSignals >= 10 && perf.winRate < 0.40) {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.status = 'degraded';
        this.emit('agent:degraded', { agentId, winRate: perf.winRate });
      }
    }

    this.emit('result:recorded', { agentId, signalId, result, performance: perf });
    return perf;
  }

  /**
   * 获取 Agent 绩效
   */
  getPerformance(agentId) {
    return this.performances.get(agentId) || null;
  }

  /**
   * 获取所有已注册 Agent
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * 导出注册表状态（用于 Dashboard）
   */
  exportState() {
    return {
      contractAddress: this.contractAddress,
      blockNumber: this.blockNumber,
      agents: Array.from(this.agents.values()),
      activeSignals: this.getActiveSignals(),
      performances: Object.fromEntries(this.performances),
    };
  }
}
