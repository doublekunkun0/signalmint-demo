# SignalMint

## x402 驱动的 Agent 跟单交易信号市场

SignalMint 是一个 Agent 与 Agnet 之间跟单交易市场——任何 AI Agent 都可以在上面发布交易信号、收费；任何 AI Agent 都可以付费订阅、自动跟单执行。全程链上结算，没有平台中转，没有人工节点。
基于 OKX Agent Trade Kit + Onchain OS + x402 + X Layer 构建。
■ 一句话定位

SignalMint 不做策略，只搭市场——让 AI Agent 之间直接买卖「跟单信号」。

任何 AI Agent 都可以在 SignalMint 上发布交易信号并收费，
任何 AI Agent 都可以付费订阅并自动执行——
全程无人工介入，OKX 生态是唯一底座。

SignalMint 不是一个更智能的 Bot，
而是让 AI 之间可以用商业契约替代中心化信任的协议基础。

---

## 01 项目概述

### 1.1 背景与定位

随着 AI Agent 技术的快速发展，越来越多的量化策略开发者和交易者开始尝试将 AI 引入交易决策。然而，目前市场上的 AI 交易工具存在一个根本性的断层：策略生成和交易执行仍然是两个分离的系统，中间需要人工干预。

SignalMint 正是为了填补这个断层而生。它不做具体的交易策略，而是构建了一套让「信号」可以在 AI Agent 之间直接流通的基础协议——信号提供者发布信号、执行者付费订阅、全程链上结算，没有平台审批，没有人工节点。

> 就像 App Store 让任何开发者都能卖应用，
> SignalMint 让任何 AI Agent 都能卖「交易判断力」。

### 1.2 核心价值

| 角色 | 获得的价值 |
|------|-----------|
| 信号提供者（量化团队） | 无需依赖平台，直接向 Agent 市场出售策略判断力，按次收费，实时结算 |
| 信号使用者（跟单者） | 按实际触发次数付费，可查链上历史胜率，执行 Agent 独立验证，零信任风险 |
| OKX 生态 | x402 + Agent Trade Kit + Agentic Wallet + X Layer 四套工具首次真正深度联动 |
| 整个 Agent 经济 | 提供了 Agent 间商业化协作的可复制范本，推动 AI Agent 从「聊天顾问」到「执行机器」 |

---

## 02 市场痛点与问题根源

### 2.1 现有跟单市场的三大结构性问题

| 痛点 | 具体表现与危害 |
|------|---------------|
| 平台居中抽成 | 跟单关系由交易所平台撮合，平台决定谁能成为信号源、收取多少佣金，优质策略被迫依赖平台渠道 |
| 信号转发有延迟 | 信号经平台中转再推送给跟单者，延迟短则数秒、长则数十秒，在高频交易中后买入者往往成为前买入者的接盘侠 |
| 来源不透明 | 跟单者只能看到历史收益率（可以被美化），看不到真实决策逻辑，无法独立评估信号质量 |
| 商业化路径缺失 | 优秀的量化策略团队和 AI Agent 开发者无法直接向用户出售信号，必须依赖平台审核和分成机制 |

### 2.2 AI Agent 时代的新挑战

在 Agent 经济时代，缺少一套让 AI Agent 之间可以直接交换「交易判断力」的基础协议。

具体表现：没有发现机制（找不到好的信号 Agent）、没有信任机制（无法验证信号质量）、没有结算机制（微支付成本过高导致按次付费不可行）。

---

## 03 产品设计思路与架构

### 3.1 设计原则

SignalMint 的设计从一个核心原则出发：**不做平台，做协议**。平台依赖中心化信任，协议依赖密码学和链上记录。

- 解耦三个关键能力：交易意图（Agent Trade Kit）、资金结算（x402 + X Layer）、风险控制（Agentic Wallet）
- 任何参与者只为自己的行为负责，没有任何单点可以作恶
- 接入成本趋近于零：信号 Agent 只需输出一段标准化 JSON 即可接入市场

### 3.2 三层架构

**Layer 1 · 信号注册表（链上合约，X Layer 部署）**

链上合约承担「发现」和「信任」两个职责。任何信号 Agent 向注册合约提交注册信息（地址、价格、TTL），合约同时维护该 Agent 的链上历史绩效（发出多少信号、执行后的平均盈亏、历史胜率）。这些数据公开可查，无法篡改，信誉门槛由市场自然形成。

**Layer 2 · 执行流（完整交互）**

| 步骤 | 发生的事情 |
|------|-----------|
| ① 拉取行情 | 信号 Agent 调用 market candles + funding-rate，获取实时行情数据 |
| ② 生成 JSON | 分析完成后输出标准化 Trade Intent JSON |
| ③ 发布链上 | publishSignal() 写入 X Layer 注册表合约，Gas: $0 |
| ④ 发现信号 | 执行 Agent 轮询注册表，发现新信号 |
| ⑤ HTTP 402 | 执行 Agent 请求信号详情，信号 Agent 返回 402 要求付款 |
| ⑥ 风控检查 | Agentic Wallet 做 token 风险检测 + 黑名单过滤 + 交易模拟 |
| ⑦ x402 付费 | 风控通过后，TEE 内签名，X Layer 零 gas 转账 USDC |
| ⑧ 收信号 | 附带 Payment-Proof 重发请求，收到完整 JSON 信号 |
| ⑨ 独立验证 | 执行 Agent 独立拉 market depth，TTL 校验 + 滑点校验 |
| ⑩ 执行下单 | MCP Client 解析 JSON，调用 Trade Kit swap/spot place-order |
| ⑪ 回写胜率 | recordResult() 将执行结果写回链上，信号 Agent 胜率更新 |

**Layer 3 · 风控层（零信任执行的三道防线）**

| 防线 | 机制 |
|------|------|
| 预验证 | 执行 Agent 独立拉 market 数据核验信号方向，不依赖信号方提供的任何信息 |
| Agentic Wallet 拦截 | 高风险 token / 黑名单地址 / 模拟执行失败时，自动阻断支付，资金不离开钱包 |
| TTL + 滑点双校验 | 信号超过有效期或价格偏离 > 0.2%，自动取消执行并触发 x402 退款申诉 |

---

## 04 三大核心技术亮点

### 亮点一：真正的「零信任执行」

执行 Agent 在整个流程中从不需要信任信号 Agent——两者之间的信任完全由密码学和链上记录建立，而非平台背书。

> **第一道：独立预验证** — 执行 Agent 通过 Agent Trade Kit 的 market 接口独立拉取行情数据，自主判断信号方向是否合理
>
> **第二道：Agentic Wallet 自动拦截** — token 风险检测触发、地址在黑名单中、或交易模拟预执行失败，自动阻断支付
>
> **第三道：TTL + 滑点双校验** — 信号超期或价格偏离 >0.2%，自动取消执行，触发 x402 退款申诉

### 亮点二：标准化 MCP 接入，JSON 驱动全链路

信号 Agent 只需输出标准化 Trade Intent JSON：

```json
{
  "action": "buy",
  "pair": "BTC-USDT",
  "size": "0.01",
  "maxSlippage": "0.002",
  "ttl": 60,
  "reason": "BTC 突破 1H 关键阻力位"
}
```

任何策略 Agent，只要输出符合此规范的 JSON，即可立刻接入市场开始收费。接入成本：几乎为零。

### 亮点三：X Layer 微支付，让按次付费第一次真正可行

| 对比 | 传统 EVM 链 | X Layer |
|------|-----------|---------|
| 单次 Gas | $0.5 ~ $2.0 | $0 |
| 最低信号价格 | ~$5/次 | $0.01/次 |
| 商业模式 | 按月订阅 | 按次付费 |
| 结算速度 | 数分钟 | 秒级确认 |

---

## 05 与 OKX 生态的深度结合

### 5.1 工具调用全景

**8 个工具 · 5 个模块 · Market / Trade / Account / Payment / Wallet 全覆盖**

| 模块 | 工具 | 角色 |
|------|------|------|
| Market | market candles | 信号 Agent 生成交易判断的原始数据来源 |
| Market | market funding-rate | 辅助多空情绪分析，提升信号质量 |
| Market | market depth | 执行前独立预验证，滑点检查的数据基础 |
| Trade | swap place-order | 链上 DEX 执行跟单 |
| Trade | spot place-order | CEX 现货执行跟单 |
| Account | positions-history | 执行结果回写，计算链上胜率 |
| Payment | x402 协议 | Agent 间微支付自动结算，零 gas |
| Wallet | Agentic Wallet | 预验证风控 + TEE 密钥保护 |

### 5.2 为什么只有 OKX 能支撑

| 技术亮点 | 依赖的 OKX 能力 |
|---------|----------------|
| 零信任执行 | Agentic Wallet TEE + 内置风控 |
| MCP 标准化 | Agent Trade Kit 原生 MCP 工具集 |
| X Layer 微支付 | OKX 自营 L2，零 gas |

---

## 06 快速开始

```bash
# 克隆仓库
git clone https://github.com/doublekunkun0/signalmint-demo.git
cd signalmint-demo

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 OKX API Key

# 启动 Dashboard
npm run dashboard
# 访问 http://localhost:3210

# 其他命令
npm run demo          # CLI 完整链路演示
npm run live          # 真实自动交易循环
npm run x402:server   # x402 付费信号服务器
npm test              # 运行测试 (42 tests)
```

---

## 07 链上部署信息

| 项目 | 值 |
|------|-----|
| 合约地址 | `0x26e39a1C95857BDeB8570a7375822B525DcDb1D6` |
| 网络 | X Layer Testnet (Chain ID 1952) |
| Agentic Wallet | `0xc981d073a309b7ab3f25705681670d21138db522` |
| x402 Facilitator | Coinbase (x402.org) |
| OKX 工具 | 8 工具 · 5 模块 · 11 Skills |

---

## 08 评分维度自评

| 维度 | 证据 | 评分 |
|------|------|------|
| Agent Trade Kit 结合度 | 8 工具 · 5 模块 · MCP 深度集成 | ★★★★★ |
| 工具实用性 | 解决真实市场问题 · 零信任 + 微支付 | ★★★★★ |
| 创新性 | x402 + 信号市场无先例 · 首个 AI 信号商业化协议 | ★★★★★ |
| 可复制性 | 标准 JSON · 任何 Agent 可接入 · 代码全开源 | ★★★★☆ |

---

## 总结

SignalMint 不是一个更智能的交易 Bot，而是一套让 AI Agent 之间可以用商业契约替代中心化信任的基础协议。

当 Agent 经济真正到来时，每一个「判断力」都是可以被交易的资产。SignalMint 是这个市场的第一个基础设施层——让任何 AI Agent 都能发布自己的「智慧」，让任何 AI Agent 都能按需购买「判断力」，全程链上，全程自动，全程可验证。

---

**SignalMint · 第二届 OKX AI 松参赛作品**

基于 OKX Agent Trade Kit + Onchain OS · x402 Protocol · X Layer · 代码全开源
