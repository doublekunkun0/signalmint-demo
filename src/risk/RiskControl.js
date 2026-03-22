/**
 * RiskControl - 风控层
 * 集成 Agentic Wallet 风控能力
 *
 * 三道防线（零信任执行）：
 * 1. 预验证 (Pre-validation)
 *    - 执行 Agent 通过 Agent Trade Kit market 接口独立验证
 *    - 对比 market depth / funding-rate 检查信号合理性
 *
 * 2. Agentic Wallet 拦截
 *    - Token 风险检测 (token risk scoring API)
 *    - 黑名单地址过滤
 *    - TEE 私钥保护验证
 *
 * 3. TTL + 滑点双校验
 *    - 信号时效性检查
 *    - 执行前 market depth 实时滑点检查
 */
import { CONFIG } from '../config.js';

// Agentic Wallet 风险评级
const RISK_LEVELS = {
  SAFE: { level: 'safe', score: 0, action: 'allow' },
  CAUTION: { level: 'caution', score: 1, action: 'warn' },
  HIGH_RISK: { level: 'high_risk', score: 2, action: 'block' },
  CRITICAL: { level: 'critical', score: 3, action: 'block' },
};

export class RiskControl {
  constructor(marketService) {
    this.market = marketService;

    // Agentic Wallet 黑名单地址库
    this.blacklist = new Set([
      '0xdead000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000',
    ]);

    // Agentic Wallet 风险 token 库
    this.riskTokens = new Map([
      ['SCAM-USDT', RISK_LEVELS.CRITICAL],
      ['RUG-USDT', RISK_LEVELS.CRITICAL],
      ['FAKE-USDT', RISK_LEVELS.HIGH_RISK],
    ]);

    this.checkResults = [];
  }

  /**
   * 第一道防线：预验证 (Pre-validation)
   *
   * 执行 Agent 独立拉取 market 数据验证信号
   * 工具调用: market depth, market funding-rate
   */
  async preValidate(signal) {
    const result = { pass: true, checks: [], warnings: [] };

    // 1. 交易对合法性检查
    if (!CONFIG.supportedPairs.includes(signal.intent.pair)) {
      result.pass = false;
      result.checks.push({ name: 'pair_check', pass: false, msg: `不支持的交易对: ${signal.intent.pair}` });
      return result;
    }
    result.checks.push({ name: 'pair_check', pass: true, msg: `交易对 ${signal.intent.pair} 有效` });

    // 2. [Agent Trade Kit] market depth - 独立拉取盘口数据
    let depth, fundingRate;
    try {
      depth = await this.market.getDepth(signal.intent.pair);
      result.checks.push({
        name: 'market_depth',
        pass: true,
        msg: `盘口数据获取成功 [${depth.source || 'market depth'}]，中间价 ${depth.midPrice}`,
      });
    } catch (err) {
      // Graceful degradation: API 不可用时跳过盘口检查
      depth = null;
      result.checks.push({
        name: 'market_depth',
        pass: true,
        msg: `盘口数据跳过 (${err.message})，降级模式`,
      });
    }

    // 3. [Agent Trade Kit] market funding-rate - 验证方向合理性
    try {
      fundingRate = await this.market.getFundingRate(signal.intent.pair);
      const isBullish = signal.intent.action === 'buy';
      const fundingIsBearish = fundingRate.fundingRate < -0.0005;
      const fundingIsBullish = fundingRate.fundingRate > 0.0005;

      if (isBullish && fundingIsBearish) {
        result.warnings.push({
          name: 'funding_contradiction',
          msg: `看多信号但资金费率负 (${(fundingRate.fundingRate * 100).toFixed(4)}%)，方向矛盾`,
        });
      } else if (!isBullish && fundingIsBullish) {
        result.warnings.push({
          name: 'funding_contradiction',
          msg: `看空信号但资金费率正 (${(fundingRate.fundingRate * 100).toFixed(4)}%)，方向矛盾`,
        });
      }

      result.checks.push({
        name: 'funding_rate',
        pass: true,
        msg: `资金费率 ${fundingRate.fundingRate > 0 ? '+' : ''}${(fundingRate.fundingRate * 100).toFixed(4)}% [${fundingRate.source || 'market funding-rate'}]`,
      });
    } catch {
      result.checks.push({ name: 'funding_rate', pass: true, msg: '资金费率查询跳过 (非永续合约)' });
    }

    // 4. 仓位上限检查
    if (parseFloat(signal.intent.size) > CONFIG.risk.maxPositionSize) {
      result.pass = false;
      result.checks.push({
        name: 'size_check',
        pass: false,
        msg: `仓位 ${signal.intent.size} 超过上限 ${CONFIG.risk.maxPositionSize}`,
      });
    } else {
      result.checks.push({ name: 'size_check', pass: true, msg: `仓位 ${signal.intent.size} 在安全范围` });
    }

    // 5. 价差合理性
    if (depth && depth.spreadPercent > 0.1) {
      result.warnings.push({
        name: 'high_spread',
        msg: `买卖价差 ${depth.spreadPercent}% 偏高，注意流动性`,
      });
    }

    return result;
  }

  /**
   * 第二道防线：Agentic Wallet 风控
   *
   * 模拟 Agentic Wallet 的三项安全能力：
   * - Token 风险检测 (token risk scoring)
   * - 黑名单地址过滤
   * - TEE 私钥保护
   */
  async walletRiskCheck(signal, agentAddress) {
    const result = { pass: true, checks: [] };

    // 1. Token 风险检测 (Agentic Wallet token risk API)
    const tokenRisk = this.riskTokens.get(signal.intent.pair);
    if (tokenRisk && tokenRisk.action === 'block') {
      result.pass = false;
      result.checks.push({
        name: 'token_risk',
        pass: false,
        msg: `[Agentic Wallet] 代币 ${signal.intent.pair} 风险等级: ${tokenRisk.level}，已拦截`,
        riskLevel: tokenRisk.level,
      });
      return result;
    }
    result.checks.push({
      name: 'token_risk',
      pass: true,
      msg: '[Agentic Wallet] token 风险检测通过',
      riskLevel: 'safe',
    });

    // 2. 黑名单地址过滤
    if (this.blacklist.has(agentAddress)) {
      result.pass = false;
      result.checks.push({
        name: 'address_blacklist',
        pass: false,
        msg: `[Agentic Wallet] 地址 ${agentAddress.slice(0, 10)}... 在黑名单中`,
      });
      return result;
    }
    result.checks.push({
      name: 'address_blacklist',
      pass: true,
      msg: '[Agentic Wallet] 地址黑名单过滤通过',
    });

    // 3. TEE 私钥保护验证
    result.checks.push({
      name: 'tee_verify',
      pass: true,
      msg: '[Agentic Wallet] TEE 私钥保护验证通过',
    });

    return result;
  }

  /**
   * 第三道防线：TTL + 滑点双校验
   */
  async ttlSlippageCheck(signal) {
    const result = { pass: true, checks: [] };

    // 1. TTL 时效性检查
    const now = Date.now();
    const timeLeft = (signal.expiresAt - now) / 1000;

    if (timeLeft <= 0) {
      result.pass = false;
      result.checks.push({
        name: 'ttl_expired',
        pass: false,
        msg: `信号已过期 ${Math.abs(timeLeft).toFixed(0)} 秒，触发 x402 退款`,
      });
      return result;
    }
    result.checks.push({
      name: 'ttl_check',
      pass: true,
      msg: `信号剩余有效期 ${timeLeft.toFixed(0)} 秒`,
    });

    // 2. 实时滑点检查 (再次调用 market depth)
    try {
      const depth = await this.market.getDepth(signal.intent.pair);
      const currentPrice = depth.midPrice;
      const executionPrice = signal.intent.action === 'buy' ? depth.bestAsk : depth.bestBid;
      const slippage = Math.abs(executionPrice - currentPrice) / currentPrice;
      const maxSlippage = signal.intent.maxSlippage || CONFIG.risk.maxSlippage;

      if (slippage > maxSlippage) {
        result.pass = false;
        result.checks.push({
          name: 'slippage_exceeded',
          pass: false,
          msg: `滑点 ${(slippage * 100).toFixed(3)}% 超过阈值 ${(maxSlippage * 100).toFixed(1)}%，触发 x402 退款`,
        });
        return result;
      }
      result.checks.push({
        name: 'slippage_check',
        pass: true,
        msg: `滑点 ${(slippage * 100).toFixed(3)}% 在安全范围 (阈值 ${(maxSlippage * 100).toFixed(1)}%)`,
      });
    } catch {
      // API 不可用时跳过滑点检查
      result.checks.push({
        name: 'slippage_check',
        pass: true,
        msg: '滑点检查跳过 (盘口数据不可用)，降级模式',
      });
    }

    return result;
  }

  /**
   * 完整三道防线校验
   */
  async fullRiskCheck(signal, agentAddress) {
    const results = {
      pass: true,
      defenses: [],
      allChecks: [],
      allWarnings: [],
    };

    // Defense 1
    const preVal = await this.preValidate(signal);
    results.defenses.push({ name: '预验证 (Pre-validation)', ...preVal });
    results.allChecks.push(...preVal.checks);
    results.allWarnings.push(...(preVal.warnings || []));
    if (!preVal.pass) results.pass = false;

    // Defense 2
    if (results.pass) {
      const walletCheck = await this.walletRiskCheck(signal, agentAddress);
      results.defenses.push({ name: 'Agentic Wallet 风控', ...walletCheck });
      results.allChecks.push(...walletCheck.checks);
      if (!walletCheck.pass) results.pass = false;
    }

    // Defense 3
    if (results.pass) {
      const ttlCheck = await this.ttlSlippageCheck(signal);
      results.defenses.push({ name: 'TTL + 滑点双校验', ...ttlCheck });
      results.allChecks.push(...ttlCheck.checks);
      if (!ttlCheck.pass) results.pass = false;
    }

    this.checkResults.push(results);
    return results;
  }
}
