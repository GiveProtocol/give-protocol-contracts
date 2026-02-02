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

  // Get treasury address
  const treasuryAddress =
    process.env[chainConfig.treasuryEnvKey] || deployer.address;
  console.log(`Treasury: ${treasuryAddress}`);

  if (treasuryAddress === deployer.address) {
    console.log(
      "[WARN] Using deployer as treasury - update this for production!",
    );
  }

  const contracts = {};

  // 1. Deploy MockERC20 (testnet only)
  if (chainConfig.isTestnet) {
    console.log("\n[1/6] Deploying MockERC20...");
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Give Test Token", "GIVE");
    await mockToken.waitForDeployment();
    contracts.MockERC20 = await mockToken.getAddress();
    console.log(`[OK] MockERC20: ${contracts.MockERC20}`);
  } else {
    console.log("\n[1/6] Skipping MockERC20 (mainnet deployment)");
  }

  // 2. Deploy DurationDonation
  console.log("\n[2/6] Deploying DurationDonation...");
  const DurationDonation =
    await hre.ethers.getContractFactory("DurationDonation");
  const donation = await DurationDonation.deploy(treasuryAddress);
  await donation.waitForDeployment();
  contracts.DurationDonation = await donation.getAddress();
  console.log(`[OK] DurationDonation: ${contracts.DurationDonation}`);

  // 3. Deploy PortfolioFunds
  console.log("\n[3/6] Deploying PortfolioFunds...");
  const PortfolioFunds = await hre.ethers.getContractFactory("PortfolioFunds");
  const portfolio = await PortfolioFunds.deploy(treasuryAddress);
  await portfolio.waitForDeployment();
  contracts.PortfolioFunds = await portfolio.getAddress();
  console.log(`[OK] PortfolioFunds: ${contracts.PortfolioFunds}`);

  // 4. Deploy VolunteerVerification
  console.log("\n[4/6] Deploying VolunteerVerification...");
  const VolunteerVerification = await hre.ethers.getContractFactory(
    "VolunteerVerification",
  );
  const verification = await VolunteerVerification.deploy();
  await verification.waitForDeployment();
  contracts.VolunteerVerification = await verification.getAddress();
  console.log(`[OK] VolunteerVerification: ${contracts.VolunteerVerification}`);

  // 5. Deploy CharityScheduledDistribution
  console.log("\n[5/6] Deploying CharityScheduledDistribution...");
  const CharityScheduledDistribution = await hre.ethers.getContractFactory(
    "CharityScheduledDistribution",
  );
  const distribution =
    await CharityScheduledDistribution.deploy(treasuryAddress);
  await distribution.waitForDeployment();
  contracts.CharityScheduledDistribution = await distribution.getAddress();
  console.log(
    `[OK] CharityScheduledDistribution: ${contracts.CharityScheduledDistribution}`,
  );

  // 6. Deploy DistributionExecutor
  console.log("\n[6/6] Deploying DistributionExecutor...");
  const DistributionExecutor = await hre.ethers.getContractFactory(
    "DistributionExecutor",
  );
  const executor = await DistributionExecutor.deploy(
    contracts.CharityScheduledDistribution,
  );
  await executor.waitForDeployment();
  contracts.DistributionExecutor = await executor.getAddress();
  console.log(`[OK] DistributionExecutor: ${contracts.DistributionExecutor}`);

  // Save deployment info
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const deploymentInfo = {
    network: networkName,
    chainId: Number(chainId),
    deployer: deployer.address,
    treasury: treasuryAddress,
    timestamp: new Date().toISOString(),
    contracts,
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
  console.log("\nContract Addresses:");
  for (const [name, address] of Object.entries(contracts)) {
    console.log(`  ${name}: ${address}`);
  }

  // Print environment variables for webapp
  const envPrefix = networkName.toUpperCase().replace("SEPOLIA", "_SEPOLIA");
  console.log("\nEnvironment Variables for Webapp:");
  if (contracts.MockERC20) {
    console.log(`VITE_${envPrefix}_TOKEN_ADDRESS=${contracts.MockERC20}`);
  }
  console.log(
    `VITE_${envPrefix}_DONATION_ADDRESS=${contracts.DurationDonation}`,
  );
  console.log(
    `VITE_${envPrefix}_PORTFOLIO_ADDRESS=${contracts.PortfolioFunds}`,
  );
  console.log(
    `VITE_${envPrefix}_VERIFICATION_ADDRESS=${contracts.VolunteerVerification}`,
  );
  console.log(
    `VITE_${envPrefix}_DISTRIBUTION_ADDRESS=${contracts.CharityScheduledDistribution}`,
  );
  console.log(
    `VITE_${envPrefix}_EXECUTOR_ADDRESS=${contracts.DistributionExecutor}`,
  );

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
      await verifyContract(contracts.MockERC20, ["Give Test Token", "GIVE"]);
    }
    await verifyContract(contracts.DurationDonation, [treasuryAddress]);
    await verifyContract(contracts.PortfolioFunds, [treasuryAddress]);
    await verifyContract(contracts.VolunteerVerification, []);
    await verifyContract(contracts.CharityScheduledDistribution, [
      treasuryAddress,
    ]);
    await verifyContract(contracts.DistributionExecutor, [
      contracts.CharityScheduledDistribution,
    ]);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n[ERROR]", error);
    process.exit(1);
  });
