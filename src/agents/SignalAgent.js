/**
 * SignalAgent - 信号 Agent
 * 负责分析行情、生成标准化 JSON 信号、写入注册表
 *
 * 工具调用：
 * - market candles: 拉取 K 线数据
 * - market funding-rate: 辅助多空情绪分析
 * - 注册表: 写入信号
 */
export class SignalAgent {
  constructor({ agentId, registry, marketService, pricePerSignal = 0.05, ttl = 60 }) {
    this.agentId = agentId;
    this.registry = registry;
    this.market = marketService;
    this.pricePerSignal = pricePerSignal;
    this.ttl = ttl;
    this.profile = null;
    this.signalCount = 0;
  }

  /**
   * 注册到信号市场
   */
  register() {
    this.profile = this.registry.registerAgent({
      agentId: this.agentId,
      pricePerSignal: this.pricePerSignal,
      ttl: this.ttl,
      description: `AI 量化策略 Agent - ${this.agentId}`,
    });
    return this.profile;
  }

  /**
   * 分析行情并生成信号
   */
  async analyzeAndGenerate(pair = 'BTC-USDT') {
    // Step 1: Pull candle data [market candles]
    const candleData = await this.market.getCandles(pair, '1H', 24);

    // Step 2: Pull funding rate [market funding-rate]
    const fundingData = await this.market.getFundingRate(pair);

    // Step 3: Analyze with technical indicators
    const analysis = this.market.analyzeCandles(candleData.data);

    // Step 4: Generate trade intent if signal is clear
    if (analysis.signal === 'neutral') {
      return {
        generated: false,
        reason: analysis.reason,
        analysis,
      };
    }

    // Step 5: Construct standard Trade Intent JSON
    const targetPrice = analysis.signal === 'buy'
      ? +(candleData.currentPrice * 1.008).toFixed(2)
      : +(candleData.currentPrice * 0.992).toFixed(2);

    const stopLoss = analysis.signal === 'buy'
      ? +(candleData.currentPrice * 0.995).toFixed(2)
      : +(candleData.currentPrice * 1.005).toFixed(2);

    const intent = {
      action: analysis.signal,
      pair,
      size: '0.01',
      maxSlippage: 0.002,
      ttl: this.ttl,
      reason: analysis.reason,
      targetPrice,
      stopLoss,
    };

    // Step 6: Publish to registry
    const signal = this.registry.publishSignal(this.agentId, intent);
    this.signalCount++;

    return {
      generated: true,
      signal,
      intent,
      analysis,
      fundingRate: fundingData,
      currentPrice: candleData.currentPrice,
    };
  }

  /**
   * 获取 Agent 状态
   */
  getStatus() {
    return {
      agentId: this.agentId,
      address: this.profile?.address,
      pricePerSignal: this.pricePerSignal,
      signalCount: this.signalCount,
      performance: this.registry.getPerformance(this.agentId),
    };
  }
}
