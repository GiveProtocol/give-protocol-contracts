const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Chain-specific configuration for deployment
 */
const CHAIN_CONFIG = {
  // Testnets
  baseSepolia: {
    name: "Base Sepolia",
    treasuryEnvKey: "BASE_TREASURY_ADDRESS",
    explorerName: "Basescan",
    nativeSymbol: "ETH",
    isTestnet: true,
  },
  optimismSepolia: {
    name: "Optimism Sepolia",
    treasuryEnvKey: "OPTIMISM_TREASURY_ADDRESS",
    explorerName: "Optimism Etherscan",
    nativeSymbol: "ETH",
    isTestnet: true,
  },
  moonbase: {
    name: "Moonbase Alpha",
    treasuryEnvKey: "MOONBEAM_TREASURY_ADDRESS",
    explorerName: "Moonscan",
    nativeSymbol: "DEV",
    isTestnet: true,
  },
  // Mainnets
  base: {
    name: "Base",
    treasuryEnvKey: "BASE_TREASURY_ADDRESS",
    explorerName: "Basescan",
    nativeSymbol: "ETH",
    isTestnet: false,
  },
  optimism: {
    name: "Optimism",
    treasuryEnvKey: "OPTIMISM_TREASURY_ADDRESS",
    explorerName: "Optimism Etherscan",
    nativeSymbol: "ETH",
    isTestnet: false,
  },
  moonbeam: {
    name: "Moonbeam",
    treasuryEnvKey: "MOONBEAM_TREASURY_ADDRESS",
    explorerName: "Moonscan",
    nativeSymbol: "GLMR",
    isTestnet: false,
  },
};

// Timelock delays
const FUND_HOLDING_DELAY = 72 * 60 * 60; // 72 hours
const RECORD_KEEPING_DELAY = 24 * 60 * 60; // 24 hours

/**
 * Verifies a contract on the block explorer
 * @param {string} address - Contract address
 * @param {Array} constructorArguments - Constructor arguments
 * @returns {Promise<void>}
 */
async function verifyContract(address, constructorArguments = []) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments,
    });
    console.log(`[OK] Contract verified at ${address}`);
  } catch (error) {
    if (error.message.includes("already verified")) {
      console.log(`[OK] Contract already verified at ${address}`);
    } else {
      console.log(`[WARN] Verification failed: ${error.message}`);
    }
  }
}

/**
 * Universal deployment function for all supported networks
 * @returns {Promise<void>}
 */
async function main() {
  const networkName = hre.network.name;
  const chainConfig = CHAIN_CONFIG[networkName];

  if (!chainConfig) {
    throw new Error(
      `Unsupported network: ${networkName}. Supported: ${Object.keys(CHAIN_CONFIG).join(", ")}`,
    );
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Deploying to ${chainConfig.name}`);
  console.log(`${"=".repeat(60)}\n`);

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Check balance
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(
    `Balance: ${hre.ethers.formatEther(balance)} ${chainConfig.nativeSymbol}`,
  );

  if (balance === 0n) {
    throw new Error(
      `Deployer has no ${chainConfig.nativeSymbol}. Fund the account first.`,
    );
  }

  // Get treasury / multi-sig address
  const treasuryAddress =
    process.env[chainConfig.treasuryEnvKey] || deployer.address;
  console.log(`Treasury: ${treasuryAddress}`);

  if (treasuryAddress === deployer.address) {
    console.log(
      "[WARN] Using deployer as treasury - update this for production!",
    );
  }

  // Multi-sig address for timelock proposer/executor (defaults to deployer for testnets)
  const multiSigAddress = process.env.MULTISIG_ADDRESS || deployer.address;
  console.log(`Multi-sig: ${multiSigAddress}`);

  const contracts = {};
  const timelocks = {};

  // 1. Deploy MockERC20 (testnet only)
  if (chainConfig.isTestnet) {
    console.log("\n[1/8] Deploying MockERC20...");
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Give Test Token", "GIVE");
    await mockToken.waitForDeployment();
    contracts.MockERC20 = { address: await mockToken.getAddress() };
    console.log(`[OK] MockERC20: ${contracts.MockERC20.address}`);
  } else {
    console.log("\n[1/8] Skipping MockERC20 (mainnet deployment)");
  }

  // 2. Deploy TimelockController — 72h (fund-holding contracts)
  console.log(`\n[2/8] Deploying TimelockController (${FUND_HOLDING_DELAY / 3600}h — fund-holding)...`);
  const TimelockController = await hre.ethers.getContractFactory("TimelockController");
  const timelock72h = await TimelockController.deploy(
    FUND_HOLDING_DELAY,
    [multiSigAddress], // proposers
    [multiSigAddress], // executors
    hre.ethers.ZeroAddress, // admin = address(0) → self-governing
  );
  await timelock72h.waitForDeployment();
  timelocks.fundHolding72h = await timelock72h.getAddress();
  console.log(`[OK] TimelockController (72h): ${timelocks.fundHolding72h}`);

  // 3. Deploy TimelockController — 24h (record-keeping contracts)
  console.log(`\n[3/8] Deploying TimelockController (${RECORD_KEEPING_DELAY / 3600}h — record-keeping)...`);
  const timelock24h = await TimelockController.deploy(
    RECORD_KEEPING_DELAY,
    [multiSigAddress], // proposers
    [multiSigAddress], // executors
    hre.ethers.ZeroAddress,
  );
  await timelock24h.waitForDeployment();
  timelocks.recordKeeping24h = await timelock24h.getAddress();
  console.log(`[OK] TimelockController (24h): ${timelocks.recordKeeping24h}`);

  // 4. Deploy DurationDonation proxy (fund-holding → 72h timelock as owner)
  console.log("\n[4/8] Deploying DurationDonation (UUPS proxy)...");
  const DurationDonation = await hre.ethers.getContractFactory("DurationDonation");
  const donation = await hre.upgrades.deployProxy(
    DurationDonation,
    [treasuryAddress, timelocks.fundHolding72h],
    { initializer: "initialize", kind: "uups" },
  );
  await donation.waitForDeployment();
  const donationProxy = await donation.getAddress();
  const donationImpl = await hre.upgrades.erc1967.getImplementationAddress(donationProxy);
  contracts.DurationDonation = { proxy: donationProxy, implementation: donationImpl };
  console.log(`[OK] DurationDonation proxy: ${donationProxy}`);
  console.log(`     Implementation: ${donationImpl}`);

  // 5. Deploy PortfolioFunds proxy (fund-holding → 72h timelock as admin)
  console.log("\n[5/8] Deploying PortfolioFunds (UUPS proxy)...");
  const PortfolioFunds = await hre.ethers.getContractFactory("PortfolioFunds");
  const portfolio = await hre.upgrades.deployProxy(
    PortfolioFunds,
    [treasuryAddress, deployer.address], // deployer as initial admin to configure roles
    { initializer: "initialize", kind: "uups" },
  );
  await portfolio.waitForDeployment();
  const portfolioProxy = await portfolio.getAddress();
  const portfolioImpl = await hre.upgrades.erc1967.getImplementationAddress(portfolioProxy);
  contracts.PortfolioFunds = { proxy: portfolioProxy, implementation: portfolioImpl };
  console.log(`[OK] PortfolioFunds proxy: ${portfolioProxy}`);
  console.log(`     Implementation: ${portfolioImpl}`);

  // Grant DEFAULT_ADMIN_ROLE to 72h timelock, then revoke from deployer
  const DEFAULT_ADMIN_ROLE = await portfolio.DEFAULT_ADMIN_ROLE();
  const ADMIN_ROLE = await portfolio.ADMIN_ROLE();
  const GOVERNANCE_ROLE = await portfolio.GOVERNANCE_ROLE();

  console.log("     Transferring admin roles to timelock...");
  await portfolio.grantRole(DEFAULT_ADMIN_ROLE, timelocks.fundHolding72h);
  await portfolio.grantRole(ADMIN_ROLE, timelocks.fundHolding72h);
  await portfolio.grantRole(GOVERNANCE_ROLE, timelocks.fundHolding72h);
  await portfolio.revokeRole(GOVERNANCE_ROLE, deployer.address);
  await portfolio.revokeRole(ADMIN_ROLE, deployer.address);
  await portfolio.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address);
  console.log("     [OK] Roles transferred to timelock");

  // 6. Deploy CharityScheduledDistribution proxy (fund-holding → 72h timelock as owner)
  console.log("\n[6/8] Deploying CharityScheduledDistribution (UUPS proxy)...");
  const CharityScheduledDistribution = await hre.ethers.getContractFactory("CharityScheduledDistribution");
  const distribution = await hre.upgrades.deployProxy(
    CharityScheduledDistribution,
    [treasuryAddress, timelocks.fundHolding72h],
    { initializer: "initialize", kind: "uups" },
  );
  await distribution.waitForDeployment();
  const distributionProxy = await distribution.getAddress();
  const distributionImpl = await hre.upgrades.erc1967.getImplementationAddress(distributionProxy);
  contracts.CharityScheduledDistribution = { proxy: distributionProxy, implementation: distributionImpl };
  console.log(`[OK] CharityScheduledDistribution proxy: ${distributionProxy}`);
  console.log(`     Implementation: ${distributionImpl}`);

  // 7. Deploy VolunteerVerification proxy (record-keeping → 24h timelock as owner)
  console.log("\n[7/8] Deploying VolunteerVerification (UUPS proxy)...");
  const VolunteerVerification = await hre.ethers.getContractFactory("VolunteerVerification");
  const verification = await hre.upgrades.deployProxy(
    VolunteerVerification,
    [timelocks.recordKeeping24h],
    { initializer: "initialize", kind: "uups" },
  );
  await verification.waitForDeployment();
  const verificationProxy = await verification.getAddress();
  const verificationImpl = await hre.upgrades.erc1967.getImplementationAddress(verificationProxy);
  contracts.VolunteerVerification = { proxy: verificationProxy, implementation: verificationImpl };
  console.log(`[OK] VolunteerVerification proxy: ${verificationProxy}`);
  console.log(`     Implementation: ${verificationImpl}`);

  // 8. Deploy DistributionExecutor (not upgradeable — takes proxy address)
  console.log("\n[8/8] Deploying DistributionExecutor...");
  const DistributionExecutor = await hre.ethers.getContractFactory("DistributionExecutor");
  const executor = await DistributionExecutor.deploy(distributionProxy);
  await executor.waitForDeployment();
  contracts.DistributionExecutor = { address: await executor.getAddress() };
  console.log(`[OK] DistributionExecutor: ${contracts.DistributionExecutor.address}`);

  // Save deployment info
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const deploymentInfo = {
    network: networkName,
    chainId: Number(chainId),
    deployer: deployer.address,
    treasury: treasuryAddress,
    multiSig: multiSigAddress,
    timestamp: new Date().toISOString(),
    contracts,
    timelocks,
  };

  const deploymentPath = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }

  const deploymentFile = path.join(deploymentPath, `${networkName}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n[OK] Deployment saved to: ${deploymentFile}`);

  // Update master addresses file
  const masterFile = path.join(deploymentPath, "addresses.json");
  let masterAddresses = {};
  if (fs.existsSync(masterFile)) {
    masterAddresses = JSON.parse(fs.readFileSync(masterFile, "utf8"));
  }
  masterAddresses[networkName] = deploymentInfo;
  fs.writeFileSync(masterFile, JSON.stringify(masterAddresses, null, 2));
  console.log(`[OK] Master addresses updated: ${masterFile}`);

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("DEPLOYMENT COMPLETE");
  console.log(`${"=".repeat(60)}`);
  console.log("\nContract Addresses (proxy where applicable):");
  for (const [name, info] of Object.entries(contracts)) {
    const addr = info.proxy || info.address;
    console.log(`  ${name}: ${addr}`);
    if (info.implementation) {
      console.log(`    impl: ${info.implementation}`);
    }
  }
  console.log("\nTimelock Addresses:");
  console.log(`  Fund-holding (72h): ${timelocks.fundHolding72h}`);
  console.log(`  Record-keeping (24h): ${timelocks.recordKeeping24h}`);

  // Print environment variables for webapp (always use proxy address)
  const envPrefix = networkName.toUpperCase().replace("SEPOLIA", "_SEPOLIA");
  console.log("\nEnvironment Variables for Webapp:");
  if (contracts.MockERC20) {
    console.log(`VITE_${envPrefix}_TOKEN_ADDRESS=${contracts.MockERC20.address}`);
  }
  console.log(`VITE_${envPrefix}_DONATION_ADDRESS=${contracts.DurationDonation.proxy}`);
  console.log(`VITE_${envPrefix}_PORTFOLIO_ADDRESS=${contracts.PortfolioFunds.proxy}`);
  console.log(`VITE_${envPrefix}_VERIFICATION_ADDRESS=${contracts.VolunteerVerification.proxy}`);
  console.log(`VITE_${envPrefix}_DISTRIBUTION_ADDRESS=${contracts.CharityScheduledDistribution.proxy}`);
  console.log(`VITE_${envPrefix}_EXECUTOR_ADDRESS=${contracts.DistributionExecutor.address}`);

  // Verify contracts if API key available
  const hasApiKey =
    process.env.BASESCAN_API_KEY ||
    process.env.OPTIMISM_ETHERSCAN_API_KEY ||
    process.env.MOONSCAN_API_KEY;

  if (hasApiKey && networkName !== "hardhat") {
    console.log(
      `\n[INFO] Waiting 30s for ${chainConfig.explorerName} to index contracts...`,
    );
    await new Promise((r) => setTimeout(r, 30000));

    console.log("\nVerifying contracts...");

    if (contracts.MockERC20) {
      await verifyContract(contracts.MockERC20.address, ["Give Test Token", "GIVE"]);
    }
    // Verify timelock controllers
    await verifyContract(timelocks.fundHolding72h, [
      FUND_HOLDING_DELAY,
      [multiSigAddress],
      [multiSigAddress],
      hre.ethers.ZeroAddress,
    ]);
    await verifyContract(timelocks.recordKeeping24h, [
      RECORD_KEEPING_DELAY,
      [multiSigAddress],
      [multiSigAddress],
      hre.ethers.ZeroAddress,
    ]);
    // Verify implementation contracts
    await verifyContract(contracts.DurationDonation.implementation, []);
    await verifyContract(contracts.PortfolioFunds.implementation, []);
    await verifyContract(contracts.CharityScheduledDistribution.implementation, []);
    await verifyContract(contracts.VolunteerVerification.implementation, []);
    // Verify DistributionExecutor
    await verifyContract(contracts.DistributionExecutor.address, [distributionProxy]);
  }
}

main().catch((error) => {
  console.error("\n[ERROR]", error);
  process.exitCode = 1;
});
