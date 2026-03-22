const hre = require("hardhat");

async function main() {
  console.log("\n  SignalMint - Deploying to X Layer...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("  Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("  Balance:", hre.ethers.formatEther(balance), "OKB\n");

  if (balance === 0n) {
    console.log("  ❌ No OKB balance. Get testnet OKB from: https://www.okx.com/xlayer/faucet");
    process.exit(1);
  }

  // Deploy SignalRegistry
  console.log("  Deploying SignalRegistry...");
  const SignalRegistry = await hre.ethers.getContractFactory("SignalRegistry");
  const registry = await SignalRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("  ✓ SignalRegistry deployed to:", address);
  console.log("  ✓ Explorer: https://www.okx.com/explorer/xlayer-test/address/" + address);

  // Verify contract stats
  const totalAgents = await registry.totalAgents();
  const totalSignals = await registry.totalSignals();
  console.log(`  ✓ Initial state: ${totalAgents} agents, ${totalSignals} signals\n`);

  // Test: Register an agent
  console.log("  Testing: Register signal agent...");
  const tx = await registry.registerAgent(
    50000,  // 0.05 USDC (6 decimals)
    60,     // 60s TTL
    "SignalMint Demo Agent - alpha-quant-v1"
  );
  await tx.wait();
  console.log("  ✓ Agent registered on-chain, tx:", tx.hash);

  const winRate = await registry.getWinRate(deployer.address);
  console.log("  ✓ On-chain win rate:", winRate.toString(), "(0 = no signals yet)");

  console.log("\n  ════════════════════════════════════════");
  console.log("  ✓ Deployment complete!");
  console.log("  Contract:", address);
  console.log("  Network: X Layer Testnet (Chain ID: 195)");
  console.log("  ════════════════════════════════════════\n");

  // Output for config update
  console.log("  Update src/config.js with:");
  console.log(`  registry: { address: '${address}' }\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
