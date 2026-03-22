# SignalMint

**x402 驱动的 Agent 跟单交易信号市场**

基于 OKX Agent Trade Kit · Onchain OS 构建 | 第二届 OKX AI 松参赛作品

---

## 一句话定位

让 AI 自动发信号、自动跟单、自动结算——不经过任何平台，不需要任何人工操作。

## 架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Signal Agent   │────▶│  Signal Registry  │◀────│ Execution Agent  │
│ (market candles) │     │  (X Layer 合约)   │     │  (MCP Parser)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        ▼                       ▼                        ▼
  生成标准 JSON          链上胜率统计            三道风控防线
  Trade Intent          不可篡改记录          预验证 → Wallet → TTL
        │                       │                        │
        └───────────────────────┼────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   x402 + X Layer      │
                    │   零 gas 微支付结算    │
                    └───────────────────────┘
```

## 快速开始

```bash
# 安装依赖
npm install

# 运行 CLI Demo（完整链路演示）
npm run demo

# 启动 Web Dashboard（实时可视化）
npm run dashboard
# 然后访问 http://localhost:3210
```

## 项目结构

```
signalmint-demo/
├── src/
│   ├── registry/SignalRegistry.js   # 信号注册表（模拟链上合约）
│   ├── market/MarketDataService.js  # 市场数据（OKX Market 模块）
│   ├── payment/X402Payment.js       # x402 微支付结算
│   ├── risk/RiskControl.js          # 三道风控防线
│   ├── mcp/MCPParser.js             # MCP JSON 意图解析器
│   ├── agents/SignalAgent.js        # 信号 Agent
│   ├── agents/ExecutionAgent.js     # 执行 Agent
│   └── demo.js                      # CLI 完整链路 Demo
├── contracts/
│   └── SignalRegistry.sol           # Solidity 智能合约（X Layer 部署）
├── dashboard/
│   ├── server.js                    # Dashboard 后端 + WebSocket
│   └── public/index.html            # Dashboard 前端
└── package.json
```

## OKX 工具调用覆盖

| 模块 | 工具 | 用途 |
|------|------|------|
| Market | `market candles` | 信号 Agent 拉取 K 线生成判断 |
| Market | `market funding-rate` | 辅助多空情绪分析 |
| Market | `market depth` | 预验证 + 滑点检查 |
| Trade | `swap place-order` | DEX swap 执行 |
| Trade | `spot place-order` | CEX 现货执行 |
| Account | `account positions-history` | 结果回写，计算胜率 |
| Payment | `x402 协议` | Agent 间微支付，X Layer 零 gas |
| Wallet | `Agentic Wallet` | 风控拦截 + token 检测 + TEE |

**共 8 个工具，覆盖 5 大模块。**

## 三个核心技术亮点

1. **零信任执行** - 执行 Agent 独立验证，Agentic Wallet 自动拦截
2. **x402 + X Layer** - 单次订阅费低至 0.01 USDC，零 gas 结算
3. **标准化 JSON 意图** - 信号 Agent 输出 JSON，MCP 自动解析驱动下单

## License

MIT
