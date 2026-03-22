// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SignalRegistry - SignalMint 信号注册表合约
 * @notice 部署在 X Layer 上，负责信号 Agent 注册、信号发布、链上胜率统计
 * @dev 配合 x402 协议实现零 gas 微支付结算
 */
contract SignalRegistry {
    // ========== 数据结构 ==========

    struct AgentProfile {
        address agentAddress;
        uint256 pricePerSignal;    // 单次信号价格 (wei, USDC decimals=6)
        uint256 defaultTTL;        // 默认有效期 (秒)
        string description;
        uint256 registeredAt;
        bool isActive;
    }

    struct Signal {
        bytes32 signalId;
        address agentAddress;
        string pair;               // 交易对 e.g. "BTC-USDT"
        string action;             // "buy" or "sell"
        uint256 size;              // 仓位大小 (scaled by 1e8)
        uint256 maxSlippage;       // 最大滑点 (scaled by 1e6, e.g. 2000 = 0.2%)
        uint256 ttl;               // 有效期 (秒)
        string reason;             // 信号理由
        uint256 targetPrice;       // 目标价 (scaled by 1e2)
        uint256 createdAt;
        bool isExpired;
    }

    struct Performance {
        uint256 totalSignals;
        uint256 successfulSignals;
        int256 totalPnL;           // 总 PnL (scaled by 1e2)
        uint256 lastUpdated;
    }

    // ========== 状态变量 ==========

    mapping(address => AgentProfile) public agents;
    mapping(bytes32 => Signal) public signals;
    mapping(address => Performance) public performances;
    mapping(address => bytes32[]) public agentSignals;

    address[] public registeredAgents;
    uint256 public totalSignals;
    uint256 public totalAgents;

    // ========== 事件 ==========

    event AgentRegistered(address indexed agent, uint256 pricePerSignal, uint256 ttl);
    event SignalPublished(bytes32 indexed signalId, address indexed agent, string pair, string action);
    event ResultRecorded(bytes32 indexed signalId, address indexed agent, bool profitable, int256 pnl);
    event AgentDegraded(address indexed agent, uint256 winRate);

    // ========== 修饰器 ==========

    modifier onlyRegistered() {
        require(agents[msg.sender].isActive, "Agent not registered or inactive");
        _;
    }

    // ========== 注册函数 ==========

    /**
     * @notice 注册为信号 Agent
     * @param pricePerSignal 每次信号调用价格 (USDC, 6 decimals)
     * @param defaultTTL 默认信号有效期 (秒)
     * @param description Agent 描述
     */
    function registerAgent(
        uint256 pricePerSignal,
        uint256 defaultTTL,
        string calldata description
    ) external {
        require(!agents[msg.sender].isActive, "Already registered");
        require(pricePerSignal >= 10000, "Min price 0.01 USDC");  // 0.01 USDC
        require(defaultTTL >= 10 && defaultTTL <= 3600, "TTL: 10-3600s");

        agents[msg.sender] = AgentProfile({
            agentAddress: msg.sender,
            pricePerSignal: pricePerSignal,
            defaultTTL: defaultTTL,
            description: description,
            registeredAt: block.timestamp,
            isActive: true
        });

        performances[msg.sender] = Performance({
            totalSignals: 0,
            successfulSignals: 0,
            totalPnL: 0,
            lastUpdated: block.timestamp
        });

        registeredAgents.push(msg.sender);
        totalAgents++;

        emit AgentRegistered(msg.sender, pricePerSignal, defaultTTL);
    }

    // ========== 信号发布 ==========

    /**
     * @notice 发布交易信号
     * @param pair 交易对
     * @param action 操作方向 "buy"/"sell"
     * @param size 仓位大小
     * @param maxSlippage 最大滑点
     * @param ttl 有效期
     * @param reason 信号理由
     * @param targetPrice 目标价格
     */
    function publishSignal(
        string calldata pair,
        string calldata action,
        uint256 size,
        uint256 maxSlippage,
        uint256 ttl,
        string calldata reason,
        uint256 targetPrice
    ) external onlyRegistered returns (bytes32) {
        bytes32 signalId = keccak256(abi.encodePacked(
            msg.sender, block.timestamp, totalSignals
        ));

        uint256 signalTTL = ttl > 0 ? ttl : agents[msg.sender].defaultTTL;

        signals[signalId] = Signal({
            signalId: signalId,
            agentAddress: msg.sender,
            pair: pair,
            action: action,
            size: size,
            maxSlippage: maxSlippage,
            ttl: signalTTL,
            reason: reason,
            targetPrice: targetPrice,
            createdAt: block.timestamp,
            isExpired: false
        });

        agentSignals[msg.sender].push(signalId);
        totalSignals++;

        emit SignalPublished(signalId, msg.sender, pair, action);
        return signalId;
    }

    // ========== 结果回写 ==========

    /**
     * @notice 回写执行结果，更新链上胜率
     * @param signalId 信号 ID
     * @param profitable 是否盈利
     * @param pnl 盈亏金额
     */
    function recordResult(
        bytes32 signalId,
        bool profitable,
        int256 pnl
    ) external {
        Signal storage signal = signals[signalId];
        require(signal.agentAddress != address(0), "Signal not found");

        Performance storage perf = performances[signal.agentAddress];
        perf.totalSignals++;
        if (profitable) {
            perf.successfulSignals++;
        }
        perf.totalPnL += pnl;
        perf.lastUpdated = block.timestamp;

        signal.isExpired = true;

        // Auto-degrade if win rate drops below 40% after 10 signals
        if (perf.totalSignals >= 10) {
            uint256 winRate = (perf.successfulSignals * 10000) / perf.totalSignals;
            if (winRate < 4000) {  // < 40%
                agents[signal.agentAddress].isActive = false;
                emit AgentDegraded(signal.agentAddress, winRate);
            }
        }

        emit ResultRecorded(signalId, signal.agentAddress, profitable, pnl);
    }

    // ========== 查询函数 ==========

    /**
     * @notice 获取 Agent 胜率 (scaled by 10000, e.g. 6500 = 65%)
     */
    function getWinRate(address agent) external view returns (uint256) {
        Performance memory perf = performances[agent];
        if (perf.totalSignals == 0) return 0;
        return (perf.successfulSignals * 10000) / perf.totalSignals;
    }

    /**
     * @notice 获取已注册 Agent 列表
     */
    function getRegisteredAgents() external view returns (address[] memory) {
        return registeredAgents;
    }

    /**
     * @notice 获取 Agent 的所有信号 ID
     */
    function getAgentSignals(address agent) external view returns (bytes32[] memory) {
        return agentSignals[agent];
    }

    /**
     * @notice 检查信号是否在有效期内
     */
    function isSignalValid(bytes32 signalId) external view returns (bool) {
        Signal memory signal = signals[signalId];
        return !signal.isExpired &&
               block.timestamp <= signal.createdAt + signal.ttl;
    }
}
