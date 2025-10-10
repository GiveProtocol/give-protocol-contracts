const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Create test scheduled donations for demonstration
 * @returns {Promise<void>}
 */
async function main() {
  console.log("🚀 Creating test scheduled donations...");

  // Get the deployer account
  const [deployer, donor1, donor2] = await hre.ethers.getSigners();
  console.log("Deployer account:", deployer.address);
  console.log("Test donor 1:", donor1.address);
  console.log("Test donor 2:", donor2.address);

  // Get deployed contract addresses
  const mockTokenAddress = process.env.VITE_TOKEN_CONTRACT_ADDRESS;
  const distributionAddress = process.env.VITE_DISTRIBUTION_CONTRACT_ADDRESS;

  if (!mockTokenAddress || !distributionAddress) {
    console.error(
      "❌ Error: Contract addresses not found in environment variables",
    );
    console.log(
      "Please ensure VITE_TOKEN_CONTRACT_ADDRESS and VITE_DISTRIBUTION_CONTRACT_ADDRESS are set",
    );
    return;
  }

  // Get contract instances
  const mockToken = await hre.ethers.getContractAt(
    "MockERC20",
    mockTokenAddress,
  );
  const distribution = await hre.ethers.getContractAt(
    "CharityScheduledDistribution",
    distributionAddress,
  );

  // Test charity addresses (you can replace with actual charity addresses from your database)
  const testCharities = [
    "0x1234567890123456789012345678901234567890", // Test charity 1
    "0x2345678901234567890123456789012345678901", // Test charity 2
  ];

  console.log("\n📝 Step 1: Adding verified charities...");
  for (const charity of testCharities) {
    try {
      const tx = await distribution.addCharity(charity);
      await tx.wait();
      console.log(`✅ Added charity: ${charity}`);
    } catch (error) {
      console.log(`⚠️  Charity might already be added: ${charity}`);
    }
  }

  console.log("\n💰 Step 2: Setting token price (above $42 USD minimum)...");
  // Set token price to $50 USD (with 8 decimals)
  const tokenPrice = ethers.parseUnits("50", 8); // $50 with 8 decimals
  try {
    const tx = await distribution.setTokenPrice(mockTokenAddress, tokenPrice);
    await tx.wait();
    console.log("✅ Set token price to $50 USD");
  } catch (error) {
    console.log("⚠️  Token price might already be set");
  }

  console.log("\n🪙 Step 3: Minting test tokens to donors...");
  // Mint 1000 tokens to each test donor
  const mintAmount = ethers.parseEther("1000");

  for (const donor of [donor1, donor2]) {
    const tx = await mockToken.mint(donor.address, mintAmount);
    await tx.wait();
    console.log(`✅ Minted 1000 TEST tokens to ${donor.address}`);
  }

  console.log("\n📅 Step 4: Creating scheduled donations...");

  // Schedule 1: Donor1 schedules 120 tokens to charity1 (10 tokens/month for 12 months)
  const schedule1Amount = ethers.parseEther("120");
  console.log("\nCreating schedule 1...");

  // First approve the tokens
  const approveTx1 = await mockToken
    .connect(donor1)
    .approve(distributionAddress, schedule1Amount);
  await approveTx1.wait();
  console.log("✅ Approved token transfer");

  // Create the schedule
  const scheduleTx1 = await distribution
    .connect(donor1)
    .createSchedule(testCharities[0], mockTokenAddress, schedule1Amount);
  await scheduleTx1.wait();
  console.log(
    `✅ Created schedule: 120 tokens over 12 months to charity ${testCharities[0]}`,
  );

  // Schedule 2: Donor2 schedules 240 tokens to charity2 (20 tokens/month for 12 months)
  const schedule2Amount = ethers.parseEther("240");
  console.log("\nCreating schedule 2...");

  // First approve the tokens
  const approveTx2 = await mockToken
    .connect(donor2)
    .approve(distributionAddress, schedule2Amount);
  await approveTx2.wait();
  console.log("✅ Approved token transfer");

  // Create the schedule
  const scheduleTx2 = await distribution
    .connect(donor2)
    .createSchedule(testCharities[1], mockTokenAddress, schedule2Amount);
  await scheduleTx2.wait();
  console.log(
    `✅ Created schedule: 240 tokens over 12 months to charity ${testCharities[1]}`,
  );

  console.log("\n✨ Test scheduled donations created successfully!");
  console.log("\nYou can now:");
  console.log("1. Log in as a donor account to see the scheduled donations");
  console.log(
    `2. Use these test donor addresses: ${donor1.address} or ${donor2.address}`,
  );
  console.log("3. The schedules will appear on the /scheduled-donations page");

  // Display schedule details
  console.log("\n📊 Created Schedules Summary:");
  console.log("Schedule 1:");
  console.log(`  - Donor: ${donor1.address}`);
  console.log(`  - Charity: ${testCharities[0]}`);
  console.log("  - Total: 120 TEST tokens");
  console.log("  - Monthly: 10 TEST tokens");
  console.log("  - Duration: 12 months");

  console.log("\nSchedule 2:");
  console.log(`  - Donor: ${donor2.address}`);
  console.log(`  - Charity: ${testCharities[1]}`);
  console.log("  - Total: 240 TEST tokens");
  console.log("  - Monthly: 20 TEST tokens");
  console.log("  - Duration: 12 months");
}

main()
  .then(() => {
    console.log("\n✅ Script completed successfully");
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    throw error;
  });
