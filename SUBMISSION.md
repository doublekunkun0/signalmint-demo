SignalMint
x402 驱动的 Agent 跟单交易信号市场
第二届 OKX AI 松参赛作品
基于 OKX Agent Trade Kit + Onchain OS + x402 + X Layer 构建
■ 一句话定位
任何 AI Agent 都可以在 SignalMint 上发布交易信号并收费，
任何 AI Agent 都可以付费订阅并自动执行——
全程无人工介入，OKX 生态是唯一底座。
SignalMint 不是一个更智能的 Bot，
而是让 AI 之间可以用商业契约替代中心化信任的协议基础。
01  项目概述
1.1  背景与定位
随着 AI Agent 技术的快速发展，越来越多的量化策略开发者和交易者开始尝试将 AI 引入交易决策。然而，目前市场上的 AI 交易工具存在一个根本性的断层：策略生成和交易执行仍然是两个分离的系统，中间需要人工干预。
SignalMint 正是为了填补这个断层而生。它不做具体的交易策略，而是构建了一套让「信号」可以在 AI Agent 之间直接流通的基础协议——信号提供者发布信号、执行者付费订阅、全程链上结算，没有平台审批，没有人工节点。
■ 产品定位一句话
就像 App Store 让任何开发者都能卖应用，
SignalMint 让任何 AI Agent 都能卖「交易判断力」。
1.2  核心价值
角色
获得的价值
信号提供者（量化团队）
无需依赖平台，直接向 Agent 市场出售策略判断力，按次收费，实时结算
信号使用者（跟单者）
按实际触发次数付费，可查链上历史胜率，执行 Agent 独立验证，零信任风险
OKX 生态
x402 + Agent Trade Kit + Agentic Wallet + X Layer 四套工具首次真正深度联动
整个 Agent 经济
提供了 Agent 间商业化协作的可复制范本，推动 AI Agent 从「聊天顾问」到「执行机器」
02  市场痛点与问题根源
2.1  现有跟单市场的三大结构性问题
当前中心化交易所提供的跟单功能，在表面上解决了「普通用户如何参与量化交易」的问题，但底层存在三个根本性缺陷：
痛点
具体表现与危害
平台居中抽成
跟单关系由交易所平台撮合，平台决定谁能成为信号源、收取多少佣金，优质策略被迫依赖平台渠道
信号转发有延迟
信号经平台中转再推送给跟单者，延迟短则数秒、长则数十秒，在高频交易中后买入者往往成为前买入者的接盘侠
来源不透明
跟单者只能看到历史收益率（可以被美化），看不到真实决策逻辑，无法独立评估信号质量
商业化路径缺失
优秀的量化策略团队和 AI Agent 开发者无法直接向用户出售信号，必须依赖平台审核和分成机制
2.2  AI Agent 时代的新挑战
当交易的「决策者」从人变成 AI Agent 时，上述问题被进一步放大。AI Agent 无法像人类一样手动操作跟单界面，Agent 之间的信号传递需要标准化协议，Agent 之间的价值交换需要可信的自动化结算机制——而这些，现有平台都没有提供。
■ 核心问题定义
在 Agent 经济时代，缺少一套让 AI Agent 之间可以直接交换「交易判断力」的基础协议。
具体表现：没有发现机制（找不到好的信号 Agent）、没有信任机制（无法验证信号质量）、
没有结算机制（微支付成本过高导致按次付费不可行）。
03  产品设计思路与架构
3.1  设计原则
SignalMint 的设计从一个核心原则出发：不做平台，做协议。平台依赖中心化信任，协议依赖密码学和链上记录。
解耦三个关键能力：交易意图（Agent Trade Kit）、资金结算（x402 + X Layer）、风险控制（Agentic Wallet）
任何参与者只为自己的行为负责，没有任何单点可以作恶
接入成本趋近于零：信号 Agent 只需输出一段标准化 JSON 即可接入市场
3.2  三层架构
SignalMint 由三层构成，每层解决一个独立问题：
Layer 1 · 信号注册表（链上合约，X Layer 部署）
链上合约承担「发现」和「信任」两个职责。任何信号 Agent 向注册合约提交注册信息（地址、价格、TTL），合约同时维护该 Agent 的链上历史绩效（发出多少信号、执行后的平均盈亏、历史胜率）。这些数据公开可查，无法篡改，信誉门槛由市场自然形成。
Layer 2 · 执行流（13 步完整交互）
步骤
发生的事情
① 拉取行情
信号 Agent 调用 market candles + funding-rate，获取实时行情数据
② 生成 JSON
分析完成后输出标准化 Trade Intent JSON
③ 发布链上
publishSignal() 写入 X Layer 注册表合约，Gas: $0
④ 发现信号
执行 Agent 轮询注册表，发现新信号
⑤ HTTP 402
执行 Agent 请求信号详情，信号 Agent 返回 402 要求付款
⑥ 风控检查
Agentic Wallet 做 token 风险检测 + 黑名单过滤 + 交易模拟
⑦ x402 付费
风控通过后，TEE 内签名，X Layer 零 gas 转账 USDC
⑧ 收信号
附带 Payment-Proof 重发请求，收到完整 JSON 信号
⑨ 独立验证
执行 Agent 独立拉 market depth，TTL 校验 + 滑点校验
⑩ 执行下单
MCP Client 解析 JSON，调用 Trade Kit swap/spot place-order
⑪ 回写胜率
recordResult() 将执行结果写回链上，信号 Agent 胜率更新
Layer 3 · 风控层（零信任执行的三道防线）
防线
机制
预验证
执行 Agent 独立拉 market 数据核验信号方向，不依赖信号方提供的任何信息
Agentic Wallet 拦截
高风险 token / 黑名单地址 / 模拟执行失败时，自动阻断支付，资金不离开钱包
TTL + 滑点双校验
信号超过有效期或价格偏离 > 0.2%，自动取消执行并触发 x402 退款申诉
3.3  产品架构图与执行时序
下图展示了 SignalMint 的完整产品架构，包括三层结构、OKX 工具调用全景以及 13 步执行时序：
图1：SignalMint 产品架构图 · 三层结构 · OKX 工具调用全景 · 13步执行时序
04  三大核心技术亮点
亮点一：真正的「零信任执行」
这是 SignalMint 与所有现有跟单系统最根本的区别。执行 Agent 在整个流程中从不需要信任信号 Agent——两者之间的信任完全由密码学和链上记录建立，而非平台背书。
■ 零信任的三道防线
→ 第一道：独立预验证
   执行 Agent 通过 Agent Trade Kit 的 market 接口独立拉取行情数据，
   自主判断信号方向是否合理，不依赖信号方提供的任何解释。
→ 第二道：Agentic Wallet 自动拦截
   若 token 风险检测触发、地址在黑名单中、或交易模拟预执行失败，
   Agentic Wallet 自动阻断支付，资金不会离开执行 Agent 的钱包。
→ 第三道：TTL + 滑点双校验
   信号超期或价格偏离 >0.2%，自动取消执行，触发 x402 退款申诉。
亮点二：标准化 MCP 接入，JSON 驱动全链路
SignalMint 能够推广的关键在于接入门槛趋近于零。信号 Agent 只需按照协议输出一段标准化的 Trade Intent JSON，执行 Agent 的 MCP Client 即可自动解析并驱动 Agent Trade Kit 完成下单，无需任何额外配置。
■ 标准 Trade Intent JSON 格式
{ "action": "buy",
  "pair": "BTC-USDT",
  "size": "0.01",
  "maxSlippage": "0.002",
  "ttl": 60,
  "reason": "BTC 突破 1H 关键阻力位" }
任何策略 Agent，只要输出符合此规范的 JSON，即可立刻接入市场开始收费。
接入成本：几乎为零。
MCP Client 接收到 JSON 后，自动完成：解析意图 → 映射到对应 Trade Kit 工具 → 下单执行。整个过程无需执行 Agent 具备任何交易知识，协议层完成所有翻译工作。
亮点三：X Layer 微支付，让按次付费第一次真正可行
Agent 之间的高频信号订阅天然是微支付场景。如果每次结算的 Gas 费用高于信号本身的价值，整个商业模式就无法成立。X Layer 零 gas 的特性正好解决了这个问题。
对比维度
传统 EVM 链 vs X Layer
单次 Gas 费用
$0.5 ~ $2.0（使得低于 $5 的信号订阅不可行）vs $0（X Layer 原生链）
最低可行信号价格
~$5/次（Gas 占比超过信号价值）vs $0.01/次（纯信号价值）
支持的商业模式
按月订阅（最小可行单位高）vs 按次付费（真正的微支付经济）
结算速度
依赖 L1 确认（数分钟）vs X Layer 秒级确认（实时反馈）
x402 协议配合 X Layer，让信号提供者可以实现三级定价：基础信号免费（引流）→ 标准信号 $0.01/次 → 深度分析 $0.1/次。真正实现「按价值付费」而非「按订阅包付费」。
05  与 OKX 生态的深度结合
5.1  工具调用全景
SignalMint 横向覆盖了 OKX Agent Trade Kit 的 5 个模块，共调用 8 个工具，是参赛作品中工具调用深度最高的方案之一：
模块
工具名称
在 SignalMint 中的角色
Market
market candles
信号 Agent 生成交易判断的原始数据来源
Market
market funding-rate
辅助多空情绪分析，提升信号质量
Market
market depth
执行前独立预验证，滑点检查的数据基础
Trade
swap place-order
链上 DEX 执行跟单（MCP JSON 解析后触发）
Trade
spot place-order
CEX 现货执行跟单（MCP JSON 解析后触发）
Account
account positions-history
执行结果回写，计算信号 Agent 链上胜率
Payment
x402 协议
Agent 间微支付自动结算，X Layer 零 gas
Wallet
Agentic Wallet
预验证风控 + TEE 密钥保护 + 三道防线执行
■ 工具调用密度：8 个工具 · 5 个模块 · Market / Trade / Account / Payment / Wallet 全覆盖
■ 首次实现：Agent Trade Kit (CEX) + Onchain OS DEX + x402 + X Layer 四套工具真实联动
5.2  为什么只有 OKX 能支撑这个方案
SignalMint 的三个核心技术亮点，每一个都依赖 OKX 生态的独特能力：
技术亮点
依赖的 OKX 独特能力
零信任执行
Agentic Wallet 的 TEE 可信执行环境 + 内置风控检测，其他钱包无法提供同等安全保证
MCP 标准化接入
Agent Trade Kit 是目前市场上功能最完整的交易所原生 MCP 工具集，支持 swap/spot/options 全品类
X Layer 微支付
OKX 自营 L2，零 gas 结算，Chain ID 195，是 x402 协议的最优结算网络
06  产品 Demo 演示
6.1  Demo 界面概览
SignalMint 提供了一个完整的交互式 Demo，模拟四种用户角色的完整操作路径。界面采用终端风格设计，与 Agent Trade Kit 的 CLI 工具体验一致：
图2：SignalMint Demo 主界面 · 四角色入口 · 终端交互风格
6.2  四个角色的完整操作路径
角色一：信号提供者
填写 Agent 名称、交易对、价格（最低 0.01 USDC/次）、TTL
点击注册，模拟 Agentic Wallet TEE 初始化 + X Layer 合约写入
进入运行界面，每次点击「发布新信号」走完整流程：
① 调用 market candles (Agent Trade Kit MCP Server)
② 调用 market funding-rate
③ 生成 Trade Intent JSON
④ publishSignal() → X Layer 注册表合约 · Gas: $0
⑤ 实时更新发布数、被订阅次数、累计收入 USDC、链上胜率
角色二：跟单执行者
看到所有信号 Agent 列表，可按胜率/价格/信号数排序
选择一个 Agent 点击订阅，进入执行界面
每次点击「执行跟单」走完整 13 步链路，步骤指示器实时高亮：
① 拉行情 → ② 生成JSON → ③ 发布链上 → ④ 发现信号 → ⑤ 请求信号
⑥ 402响应 → ⑦ 风控检查 → ⑧ x402付费 → ⑨ 附证明 → ⑩ 收信号
⑪ 独立验证 → ⑫ 执行下单 → ⑬ 回写胜率
最终显示：订单号 · 成交价 · 累计 PnL · Gas 花费 = $0
角色三：信号市场浏览
展示所有注册 Agent 的完整信息：名称、交易对、价格、胜率、信号数、Agentic Wallet 地址、链上状态，支持三种排序方式。
角色四：链上查询
展示注册表合约地址、最近 x402 结算记录（含 Gas=$0 确认）、链上胜率排行（不可篡改）、协议参数配置。
6.3  30 秒 Demo 视频脚本
Demo 视频全程展示 CLI 终端，专注验证核心链路：
> 信号 Agent 启动...
> 读取 BTC-USDT 1H K 线 [market candles] ...
> 生成 Trade Intent JSON：做多 · 目标 88,200 · TTL 60s
> 信号写入 X Layer 注册表 [0x7F3a...B4c9] ✓
> 执行 Agent 检测到新信号...
> 预验证：独立拉 market 数据核验信号合理性 ✓
> Agentic Wallet 风控：token ✓ · 黑名单 ✓ · 模拟 ✓
> x402 支付 0.05 USDC [X Layer 零 gas] ✓
> MCP 解析 JSON → 调用 Trade Kit swap place-order
> 订单 #8827364 成交 ✓ · Gas: $0
> 结果回写链上 · 信号 Agent 胜率更新 ✓
[ 字幕：本 Demo 验证「零信任执行 + x402 微支付 + MCP 标准化」完整链路 ]
07  可持续发展的市场经济
7.1  经济模型设计
SignalMint 的经济模型由三个自我强化的循环构成：
循环
运作机制
信号质量循环
高胜率信号 → 更多订阅 → 更多收入 → 投入更多策略研发 → 胜率进一步提升
信誉积累循环
链上胜率不可篡改 → 优质 Agent 建立长期信誉 → 订阅价格溢价 → 形成护城河
生态扩张循环
更多信号 Agent 接入 → 执行 Agent 选择更多 → 平台价值提升 → 吸引更多信号 Agent
7.2  防作弊机制
经济模型的可持续性依赖于反操纵设计：
链上胜率完全由执行结果客观计算，信号 Agent 无法修改自己的历史记录
胜率持续低于 40% 的信号 Agent 在注册表中自动降权，执行 Agent 可配置过滤条件
每次信号都有 TTL（有效期），过期信号无法被订阅，防止历史优质信号被反复重用
x402 退款机制：若信号 Agent 提供无效信号导致执行失败，执行 Agent 可发起退款申诉
7.3  三级定价体系
X Layer 零 gas 使得微支付经济真正可行，SignalMint 支持信号 Agent 构建三级定价：
级别
价格区间
适用场景
基础信号
免费（引流）
简单的方向性判断，用于建立初始信誉
标准信号
$0.01 ~ $0.10/次
常规量化信号，主要收入来源
深度分析
$0.10 ~ $1.00/次
含详细理由和风控参数的高质量信号
■ 对比：传统跟单平台
传统平台：按月订阅（最小单位 $10~$50/月）+ 平台抽成 20%~30%
SignalMint：按次付费（最小单位 $0.01）+ 零平台抽成 + 直接结算
信号 Agent 年收入潜力：100 个订阅者 × 10 次/天 × $0.05/次 × 365 天 = $18,250
7.4  长期增长路径
SignalMint 的协议层设计确保了它可以随 OKX 生态和 AI Agent 技术的发展持续演进：
阶段
里程碑
MVP（当前）
单对单信号订阅，验证 x402 + Trade Kit 完整链路，X Layer 部署
V1.0
多信号 Agent 市场，链上胜率排行，信誉系统上线，开源 SDK
V2.0
引入 ERC-8004 Agent 信誉标准，支持信号 Agent 间的 A2A 子委托
V3.0
跨链信号市场，支持多链执行，接入更多 DEX 和 CEX 的 MCP 工具
08  创新性分析
8.1  行业首创
SignalMint 在以下几个维度具有明确的行业首创性：
创新点
首创说明
x402 + 信号市场
首次将 x402 支付协议应用于交易信号的按次结算场景，此前无任何已知项目做到
MCP 标准化信号格式
首次为 AI Agent 之间的交易信号定义标准化 JSON 协议，让任何 Agent 零成本接入
零信任跟单执行
首次实现执行 Agent 对信号 Agent 的完全独立验证，不依赖任何第三方信任背书
Agent 信号商业化基础设施
首次为 AI Agent 的交易信号创造完整的发现-付费-执行-结算闭环
8.2  与第一届获奖作品的关系
第一届一等奖 VeriTask 构建的是 Agent 之间的信任基础设施（zkTLS + TEE + A2A）。SignalMint 站在这个基础之上，将「信任」转化为「商业价值」——Agent 之间不仅能互相信任，更能互相交易。
VeriTask（第一届一等奖）：让 Agent 之间能互相信任 → 解决「信任」问题
SignalMint（本届参赛）：让 Agent 之间能互相交易 → 解决「商业化」问题
两者在逻辑上是递进关系：信任是商业化的前提，商业化是信任的价值实现。
SignalMint 是 VeriTask 所定义的「Agent 经济」的第一个具体落地场景。
09  参赛评分维度自评
评分维度
核心证据
预期得分
Agent Trade Kit 结合度
8 个工具 · 5 个模块 · Market/Trade/Account/Payment/Wallet 全覆盖 · MCP 深度集成
★★★★★
工具实用性
解决真实市场结构问题 · 零信任执行 + 微支付让跟单首次真正去中心化
★★★★★
创新性
x402 + 信号市场组合无先例 · 三点解耦设计角度罕见 · 首个 AI 信号商业化协议
★★★★★
可复制性
CLI 工具任何人可运行 · 标准 JSON 协议任何 Agent 可接入 · 降级方案完备 · 代码全开源
★★★★☆
10  总结
SignalMint 不是一个更智能的交易 Bot，而是一套让 AI Agent 之间可以用商业契约替代中心化信任的基础协议。
它从一个真实的市场痛点出发——现有跟单系统依赖平台、有延迟、不透明——提出了一个根本性的解法：把信号的发现、付费、执行、结算全部搬到链上，用密码学替代信任，用 x402 微支付替代平台抽成，用 MCP 标准化替代定制接入。
这个解法恰好需要 OKX 生态中四套工具的协同才能实现：Agent Trade Kit 提供执行能力，x402 协议提供结算能力，Agentic Wallet 提供安全能力，X Layer 提供零 gas 的微支付基础。没有任何一个能被替换。
■ SignalMint 的终极愿景
当 Agent 经济真正到来时，每一个「判断力」都是可以被交易的资产。
SignalMint 是这个市场的第一个基础设施层——
让任何 AI Agent 都能发布自己的「智慧」，
让任何 AI Agent 都能按需购买「判断力」，
全程链上，全程自动，全程可验证。
SignalMint · 第二届 OKX AI 松参赛作品
基于 OKX Agent Trade Kit + Onchain OS · x402 Protocol · X Layer · 代码全开源