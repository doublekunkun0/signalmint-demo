// SignalMint Configuration
export const CONFIG = {
  // X Layer Network Config
  xLayer: {
    rpcUrl: 'https://testrpc.xlayer.tech',
    chainId: 1952,
    explorerUrl: 'https://www.okx.com/explorer/xlayer-test',
  },

  // Signal Registry Contract (deployed on X Layer Testnet)
  registry: {
    address: '0x26e39a1C95857BDeB8570a7375822B525DcDb1D6',
  },

  // Agentic Wallet
  agenticWallet: {
    evm: '0xc981d073a309b7ab3f25705681670d21138db522',
    solana: 'Ev8Gdxp6dyHeVT55hMSxXHiAMPm4BGHGscW5ViRiz435',
    accountId: '2b33de72-608d-4776-8308-36b0af5cadb0',
  },

  // Deployer
  deployer: '0x1E67eF8a367776fd78CF9a57ad0ddC130F1589E9',

  // x402 Payment Config
  x402: {
    minPayment: 0.01,    // Minimum payment in USDT
    maxPayment: 10.0,    // Maximum single payment
    settlementToken: 'USDC',
    zeroGas: true,        // X Layer zero gas feature
  },

  // Risk Control Defaults
  risk: {
    defaultTTL: 60,             // Signal TTL in seconds
    maxSlippage: 0.002,         // 0.2% default max slippage
    minWinRate: 0.40,           // 40% minimum win rate threshold
    blacklistCheck: true,       // Enable token blacklist check
    maxPositionSize: 0.1,       // Max 0.1 BTC per signal
  },

  // Market Data Config
  market: {
    defaultPair: 'BTC-USDT',
    candleInterval: '1H',
    depthLimit: 20,
  },

  // Supported Trading Pairs
  supportedPairs: [
    'BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'OKB-USDT',
    'DOGE-USDT', 'ARB-USDT', 'OP-USDT', 'MATIC-USDT',
  ],
};
