const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Test charity addresses for Moonbase Alpha
// In production, these should be real charity wallet addresses
const TEST_CHARITIES = {
  // Environmental charities
  oceanCleanup: "0x1234567890123456789012345678901234567890",
  rainforestAlliance: "0x2345678901234567890123456789012345678901",
  solarSister: "0x3456789012345678901234567890123456789012",
  treesForFuture: "0x4567890123456789012345678901234567890123",
  
  // Poverty relief charities
  giveDirectly: "0x5678901234567890123456789012345678901234",
  grameenFoundation: "0x6789012345678901234567890123456789012345",
  oxfamInternational: "0x7890123456789012345678901234567890123456",
  heiferInternational: "0x8901234567890123456789012345678901234567",
  
  // Education charities
  roomToRead: "0x9012345678901234567890123456789012345678",
  teachForAll: "0x0123456789012345678901234567890123456789",
  khanAcademy: "0xabcdef1234567890123456789012345678901234",
  girlsWhoCode: "0xbcdef12345678901234567890123456789012345"
};

async function setupVerifiedCharities(portfolioFunds) {
  const charityList = [
    // Environmental charities
    { address: TEST_CHARITIES.oceanCleanup, name: "Ocean Cleanup Foundation" },
    { address: TEST_CHARITIES.rainforestAlliance, name: "Rainforest Alliance" },
    { address: TEST_CHARITIES.solarSister, name: "Solar Sister" },
    { address: TEST_CHARITIES.treesForFuture, name: "Trees for the Future" },
    
    // Poverty relief charities
    { address: TEST_CHARITIES.giveDirectly, name: "GiveDirectly" },
    { address: TEST_CHARITIES.grameenFoundation, name: "Grameen Foundation" },
    { address: TEST_CHARITIES.oxfamInternational, name: "Oxfam International" },
    { address: TEST_CHARITIES.heiferInternational, name: "Heifer International" },
    
    // Education charities
    { address: TEST_CHARITIES.roomToRead, name: "Room to Read" },
    { address: TEST_CHARITIES.teachForAll, name: "Teach for All" },
    { address: TEST_CHARITIES.khanAcademy, name: "Khan Academy" },
    { address: TEST_CHARITIES.girlsWhoCode, name: "Girls Who Code" }
  ];

  for (const charity of charityList) {
    console.log(`  Adding ${charity.name}...`);
    const tx = await portfolioFunds.addVerifiedCharity(charity.address, charity.name);
    await tx.wait();
  }
  console.log("✅ All charities verified");
}

async function createPortfolioFunds(portfolioFunds) {
  // Environmental Impact Fund
  console.log("\n  Creating Environmental Impact Fund...");
  const envCharities = [
    TEST_CHARITIES.oceanCleanup,
    TEST_CHARITIES.rainforestAlliance,
    TEST_CHARITIES.solarSister,
    TEST_CHARITIES.treesForFuture
  ];
  const envNames = [
    "Ocean Cleanup Foundation",
    "Rainforest Alliance",
    "Solar Sister",
    "Trees for the Future"
  ];
  
  let tx = await portfolioFunds.createPortfolioFund(
    "Environmental Impact Fund",
    "Supporting environmental sustainability and climate action worldwide through ocean cleanup, forest preservation, renewable energy access, and reforestation efforts.",
    envCharities,
    envNames
  );
  await tx.wait();
  console.log("  ✅ Environmental Impact Fund created");

  // Poverty Relief Impact Fund
  console.log("\n  Creating Poverty Relief Impact Fund...");
  const povertyCharities = [
    TEST_CHARITIES.giveDirectly,
    TEST_CHARITIES.grameenFoundation,
    TEST_CHARITIES.oxfamInternational,
    TEST_CHARITIES.heiferInternational
  ];
  const povertyNames = [
    "GiveDirectly",
    "Grameen Foundation",
    "Oxfam International",
    "Heifer International"
  ];
  
  tx = await portfolioFunds.createPortfolioFund(
    "Poverty Relief Impact Fund",
    "Fighting global poverty through direct cash transfers, microfinance, humanitarian aid, and sustainable agricultural development programs.",
    povertyCharities,
    povertyNames
  );
  await tx.wait();
  console.log("  ✅ Poverty Relief Impact Fund created");

  // Education Impact Fund
  console.log("\n  Creating Education Impact Fund...");
  const eduCharities = [
    TEST_CHARITIES.roomToRead,
    TEST_CHARITIES.teachForAll,
    TEST_CHARITIES.khanAcademy,
    TEST_CHARITIES.girlsWhoCode
  ];
  const eduNames = [
    "Room to Read",
    "Teach for All",
    "Khan Academy",
    "Girls Who Code"
  ];
  
  tx = await portfolioFunds.createPortfolioFund(
    "Education Impact Fund",
    "Expanding access to quality education globally through literacy programs, teacher training, online learning platforms, and technology education initiatives.",
    eduCharities,
    eduNames
  );
  await tx.wait();
  console.log("  ✅ Education Impact Fund created");

  // Get and display fund IDs
  console.log("\n📋 Created Portfolio Funds:");
  const allFunds = await portfolioFunds.getAllActiveFunds();
  for (let i = 0; i < allFunds.length; i++) {
    const fundDetails = await portfolioFunds.getFundDetails(allFunds[i]);
    console.log(`  ${i + 1}. ${fundDetails.name}`);
    console.log(`     Fund ID: ${allFunds[i]}`);
    console.log(`     Charities: ${fundDetails.charities.length}`);
    console.log(`     Distribution: ${fundDetails.ratios[0] / 100}% each`);
  }
}

async function verifyContract(contractAddress, constructorArgs) {
  console.log("Waiting 30 seconds for Moonscan to index contract...");
  await new Promise(resolve => setTimeout(resolve, 30000));

  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArgs,
    });
    console.log("✅ Contract verified successfully");
  } catch (error) {
    if (error.message.includes("already verified")) {
      console.log("✅ Contract is already verified");
    } else {
      console.log("❌ Failed to verify contract:", error.message);
    }
  }
}

async function main() {
  console.log("🚀 Starting PortfolioFunds deployment to Moonbase Alpha...");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Check account balance
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "DEV");

  if (balance === 0n) {
    console.error("❌ Error: Deployer account has no DEV tokens");
    console.log("Get testnet DEV tokens from: https://faucet.moonbeam.network/");
    throw new Error("Deployer account has no DEV tokens");
  }

  // Use the same treasury address as other contracts
  const treasuryAddress = "0x8cFc24Ad1CDc3B80338392f17f6e6ab40552e1C0";
  console.log("🏦 Using treasury address:", treasuryAddress);

  // Deploy PortfolioFunds contract
  console.log("\n📄 Deploying PortfolioFunds contract...");
  const PortfolioFunds = await hre.ethers.getContractFactory("PortfolioFunds");
  const portfolioFunds = await PortfolioFunds.deploy(treasuryAddress);
  await portfolioFunds.waitForDeployment();
  const portfolioFundsAddress = await portfolioFunds.getAddress();
  console.log("✅ PortfolioFunds deployed to:", portfolioFundsAddress);

  // Setup initial charities and funds
  console.log("\n🔧 Setting up verified charities...");
  await setupVerifiedCharities(portfolioFunds);
  
  console.log("\n🔧 Creating portfolio funds...");
  await createPortfolioFunds(portfolioFunds);

  // Load existing deployment info if it exists
  const deploymentPath = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentPath, "moonbase.json");
  let deploymentInfo = {};
  
  if (fs.existsSync(deploymentFile)) {
    deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  } else {
    // Create new deployment info structure
    deploymentInfo = {
      network: "moonbase",
      chainId: 1287,
      deployer: deployer.address,
      contracts: {}
    };
  }

  // Update with new contract
  deploymentInfo.contracts.PortfolioFunds = portfolioFundsAddress;
  deploymentInfo.lastUpdated = new Date().toISOString();

  // Save updated deployment info
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath);
  }
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\n📝 Deployment info updated in: ${deploymentFile}`);
  console.log("\n🎉 PortfolioFunds deployment complete!");
  console.log("\n📋 Contract Address:");
  console.log(`VITE_PORTFOLIO_FUNDS_CONTRACT_ADDRESS=${portfolioFundsAddress}`);
  console.log("\n📌 Add this address to your .env file");

  // Verify on Moonscan if API key is available
  if (process.env.MOONSCAN_API_KEY) {
    console.log("\n🔍 Verifying contract on Moonscan...");
    await verifyContract(portfolioFundsAddress, [treasuryAddress]);
  }
}

main()
  .then(() => {
    console.log("Deployment completed successfully");
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    throw error;
  });