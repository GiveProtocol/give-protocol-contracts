const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Verifies deployed contracts on Moonscan block explorer
 * @param {Object} contracts - Object containing contract names and addresses
 * @returns {Promise<void>}
 */
async function verifyContracts(contracts) {
  console.log("Waiting 30 seconds for Moonscan to index contracts...");
  await new Promise((resolve) => setTimeout(resolve, 30000));

  for (const [name, address] of Object.entries(contracts)) {
    try {
      console.log(`\nVerifying ${name} at ${address}...`);

      if (name === "DistributionExecutor") {
        // DistributionExecutor has constructor arguments
        await hre.run("verify:verify", {
          address,
          constructorArguments: [contracts.CharityScheduledDistribution],
        });
      } else if (name === "MockERC20") {
        // MockERC20 has constructor arguments
        await hre.run("verify:verify", {
          address,
          constructorArguments: ["Test Token", "TEST"],
        });
      } else if (name === "DurationDonation") {
        // DurationDonation has treasury address as constructor argument
        await hre.run("verify:verify", {
          address,
          constructorArguments: ["0x8cFc24Ad1CDc3B80338392f17f6e6ab40552e1C0"],
        });
      } else {
        // Other contracts have no constructor arguments
        await hre.run("verify:verify", {
          address,
          constructorArguments: [],
        });
      }

      console.log(`[OK] ${name} verified successfully`);
    } catch (error) {
      if (error.message.includes("already verified")) {
        console.log(`[OK] ${name} is already verified`);
      } else {
        console.log(`[ERROR] Failed to verify ${name}:`, error.message);
      }
    }
  }
}

/**
 * Main deployment function for Moonbase Alpha testnet
 * @returns {Promise<void>}
 */
async function main() {
  console.log("Starting deployment to Moonbase Alpha...");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Check account balance
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "DEV");

  if (balance === 0n) {
    console.error("[ERROR] Deployer account has no DEV tokens");
    console.log(
      "Get testnet DEV tokens from: https://faucet.moonbeam.network/",
    );
    throw new Error("Deployer account has no DEV tokens");
  }

  // Deploy MockERC20 token for testing donations
  console.log("\nDeploying MockERC20 token...");
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test Token", "TEST");
  await mockToken.waitForDeployment();
  const mockTokenAddress = await mockToken.getAddress();
  console.log("[OK] MockERC20 deployed to:", mockTokenAddress);

  // Set Give Protocol treasury address (using deployer for now, update this to your treasury)
  const treasuryAddress = "0x8cFc24Ad1CDc3B80338392f17f6e6ab40552e1C0";
  console.log("Using treasury address:", treasuryAddress);

  // Deploy DurationDonation contract with treasury
  console.log("\nDeploying DurationDonation contract...");
  const DurationDonation =
    await hre.ethers.getContractFactory("DurationDonation");
  const donation = await DurationDonation.deploy(treasuryAddress);
  await donation.waitForDeployment();
  const donationAddress = await donation.getAddress();
  console.log("[OK] DurationDonation deployed to:", donationAddress);

  // Deploy VolunteerVerification contract
  console.log("\nDeploying VolunteerVerification contract...");
  const VolunteerVerification = await hre.ethers.getContractFactory(
    "VolunteerVerification",
  );
  const verification = await VolunteerVerification.deploy();
  await verification.waitForDeployment();
  const verificationAddress = await verification.getAddress();
  console.log("[OK] VolunteerVerification deployed to:", verificationAddress);

  // Deploy CharityScheduledDistribution contract
  console.log("\nDeploying CharityScheduledDistribution contract...");
  const CharityScheduledDistribution = await hre.ethers.getContractFactory(
    "CharityScheduledDistribution",
  );
  const distribution = await CharityScheduledDistribution.deploy(treasuryAddress);
  await distribution.waitForDeployment();
  const distributionAddress = await distribution.getAddress();
  console.log(
    "[OK] CharityScheduledDistribution deployed to:",
    distributionAddress,
  );

  // Deploy DistributionExecutor contract
  console.log("\nDeploying DistributionExecutor contract...");
  const DistributionExecutor = await hre.ethers.getContractFactory(
    "DistributionExecutor",
  );
  const executor = await DistributionExecutor.deploy(distributionAddress);
  await executor.waitForDeployment();
  const executorAddress = await executor.getAddress();
  console.log("[OK] DistributionExecutor deployed to:", executorAddress);

  // Note: DistributionExecutor works independently and doesn't need to be set
  console.log("\n[OK] All contracts deployed successfully!");

  // Save deployment addresses
  const deploymentInfo = {
    network: "moonbase",
    chainId: 1287,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      MockERC20: mockTokenAddress,
      DurationDonation: donationAddress,
      VolunteerVerification: verificationAddress,
      CharityScheduledDistribution: distributionAddress,
      DistributionExecutor: executorAddress,
    },
  };

  const deploymentPath = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath);
  }

  const deploymentFile = path.join(deploymentPath, "moonbase.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\nDeployment info saved to: ${deploymentFile}`);
  console.log("\nDeployment complete!");
  console.log("\nContract Addresses:");
  console.log(`VITE_TOKEN_CONTRACT_ADDRESS=${mockTokenAddress}`);
  console.log(`VITE_DONATION_CONTRACT_ADDRESS=${donationAddress}`);
  console.log(`VITE_VERIFICATION_CONTRACT_ADDRESS=${verificationAddress}`);
  console.log(`VITE_DISTRIBUTION_CONTRACT_ADDRESS=${distributionAddress}`);
  console.log(`VITE_EXECUTOR_CONTRACT_ADDRESS=${executorAddress}`);
  console.log("\nAdd these addresses to your .env file");

  // Verify contracts on Moonscan if API key is available
  if (process.env.MOONSCAN_API_KEY) {
    console.log("\nVerifying contracts on Moonscan...");
    await verifyContracts(deploymentInfo.contracts);
  }
}

main()
  .then(() => {
    console.log("Deployment completed successfully");
  })
  .catch((error) => {
    console.error("[ERROR] Deployment failed:", error);
    throw error;
  });
