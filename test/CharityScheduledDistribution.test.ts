import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("CharityScheduledDistribution", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let distribution: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let executor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let token: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _owner: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let charity: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let donor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let treasury: any;

  const TOKEN_PRICE = BigInt(100 * 10 ** 8); // $100 USD with 8 decimals
  const TOTAL_AMOUNT = ethers.parseEther("12.0"); // 12 tokens
  const MONTHLY_AMOUNT = ethers.parseEther("1.0"); // 1 token per month
  const NUM_MONTHS = 12;
  const FEE_RATE = 100n; // 1% in basis points
  const BASIS_POINTS = 10000n;
  // Net amount after 1% fee: 1.0 - 0.01 = 0.99 ETH
  const NET_MONTHLY_AMOUNT = MONTHLY_AMOUNT - (MONTHLY_AMOUNT * FEE_RATE) / BASIS_POINTS;

  beforeEach(async () => {
    [_owner, charity, donor, treasury] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("Mock Token", "MTK");
    await token.mint(donor.address, ethers.parseEther("100.0"));

    // Deploy distribution contract with treasury
    const CharityScheduledDistribution = await ethers.getContractFactory(
      "CharityScheduledDistribution",
    );
    distribution = await CharityScheduledDistribution.deploy(treasury.address);

    // Deploy executor contract
    const DistributionExecutor = await ethers.getContractFactory(
      "DistributionExecutor",
    );
    executor = await DistributionExecutor.deploy(
      await distribution.getAddress(),
    );

    // Setup distribution contract
    await distribution.addCharity(charity.address);
    await distribution.setTokenPrice(await token.getAddress(), TOKEN_PRICE);
  });

  describe("Charity Management", () => {
    it("Should allow owner to add and remove charities", async () => {
      const newCharity = ethers.Wallet.createRandom().address;

      await expect(distribution.addCharity(newCharity))
        .to.emit(distribution, "CharityAdded")
        .withArgs(newCharity);

      expect(await distribution.verifiedCharities(newCharity)).to.equal(true);

      await expect(distribution.removeCharity(newCharity))
        .to.emit(distribution, "CharityRemoved")
        .withArgs(newCharity);

      expect(await distribution.verifiedCharities(newCharity)).to.equal(false);
    });

    it("Should not allow non-owner to add charities", async () => {
      const newCharity = ethers.Wallet.createRandom().address;

      await expect(
        distribution.connect(donor).addCharity(newCharity),
      ).to.be.revertedWithCustomError(
        distribution,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Token Price Management", () => {
    it("Should allow owner to set token prices", async () => {
      const newToken = ethers.Wallet.createRandom().address;
      const newPrice = BigInt(200 * 10 ** 8); // $200 USD

      await expect(distribution.setTokenPrice(newToken, newPrice))
        .to.emit(distribution, "TokenPriceSet")
        .withArgs(newToken, newPrice);

      expect(await distribution.tokenPrices(newToken)).to.equal(newPrice);
    });

    it("Should not allow non-owner to set token prices", async () => {
      const newToken = ethers.Wallet.createRandom().address;
      const newPrice = BigInt(200 * 10 ** 8); // $200 USD

      await expect(
        distribution.connect(donor).setTokenPrice(newToken, newPrice),
      ).to.be.revertedWithCustomError(
        distribution,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Schedule Creation", () => {
    beforeEach(async () => {
      // Approve tokens for distribution contract
      await token
        .connect(donor)
        .approve(await distribution.getAddress(), TOTAL_AMOUNT);
    });

    it("Should create a monthly distribution schedule", async () => {
      await expect(
        distribution
          .connect(donor)
          .createSchedule(
            charity.address,
            await token.getAddress(),
            TOTAL_AMOUNT,
            NUM_MONTHS,
            TOKEN_PRICE,
          ),
      )
        .to.emit(distribution, "ScheduleCreated")
        .withArgs(
          0, // scheduleId (starts at 0)
          donor.address,
          charity.address,
          await token.getAddress(),
          TOTAL_AMOUNT,
          MONTHLY_AMOUNT,
          NUM_MONTHS,
        );

      const schedule = await distribution.donationSchedules(0);
      expect(schedule.donor).to.equal(donor.address);
      expect(schedule.charity).to.equal(charity.address);
      expect(schedule.token).to.equal(await token.getAddress());
      expect(schedule.totalAmount).to.equal(TOTAL_AMOUNT);
      expect(schedule.amountPerMonth).to.equal(MONTHLY_AMOUNT);
      expect(schedule.monthsRemaining).to.equal(NUM_MONTHS);
      expect(schedule.active).to.equal(true);
    });

    it("Should not create schedule for unverified charity", async () => {
      const unverifiedCharity = ethers.Wallet.createRandom().address;

      await expect(
        distribution
          .connect(donor)
          .createSchedule(
            unverifiedCharity,
            await token.getAddress(),
            TOTAL_AMOUNT,
            NUM_MONTHS,
            TOKEN_PRICE,
          ),
      ).to.be.revertedWith("Charity not verified");
    });

    it("Should not create schedule with zero amount", async () => {
      await expect(
        distribution
          .connect(donor)
          .createSchedule(
            charity.address,
            await token.getAddress(),
            0,
            NUM_MONTHS,
            TOKEN_PRICE,
          ),
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Distribution Execution", () => {
    beforeEach(async () => {
      // Approve tokens for distribution contract
      await token
        .connect(donor)
        .approve(await distribution.getAddress(), TOTAL_AMOUNT);

      // Create a schedule
      await distribution
        .connect(donor)
        .createSchedule(
          charity.address,
          await token.getAddress(),
          TOTAL_AMOUNT,
          NUM_MONTHS,
          TOKEN_PRICE,
        );
    });

    it("Should not distribute before the interval has passed", async () => {
      await distribution.executeDistributions([0]);

      // No distribution should have occurred
      const schedule = await distribution.donationSchedules(0);
      expect(schedule.monthsRemaining).to.equal(NUM_MONTHS);
      expect(await token.balanceOf(charity.address)).to.equal(0);
    });

    it("Should distribute after the interval has passed with fee deduction", async () => {
      // Advance time by 31 days
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      const expectedFee = (MONTHLY_AMOUNT * FEE_RATE) / BASIS_POINTS;

      await expect(distribution.executeDistributions([0]))
        .to.emit(distribution, "DistributionExecuted")
        .withArgs(
          0, // scheduleId
          charity.address,
          await token.getAddress(),
          NET_MONTHLY_AMOUNT, // Net amount after fee
          11, // monthsRemaining
        );

      // Check distribution occurred with fee deducted
      const schedule = await distribution.donationSchedules(0);
      expect(schedule.monthsRemaining).to.equal(11);
      expect(await token.balanceOf(charity.address)).to.equal(NET_MONTHLY_AMOUNT);
      // Check fee went to treasury
      expect(await token.balanceOf(treasury.address)).to.equal(expectedFee);
    });

    it("Should execute distributions via the executor contract", async () => {
      // Advance time by 31 days
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await executor.executeDistributionBatch(0, 0);

      // Check distribution occurred with fee deducted
      const schedule = await distribution.donationSchedules(0);
      expect(schedule.monthsRemaining).to.equal(11);
      expect(await token.balanceOf(charity.address)).to.equal(NET_MONTHLY_AMOUNT);
    });
  });

  describe("Schedule Cancellation", () => {
    beforeEach(async () => {
      // Approve tokens for distribution contract
      await token
        .connect(donor)
        .approve(await distribution.getAddress(), TOTAL_AMOUNT);

      // Create a schedule
      await distribution
        .connect(donor)
        .createSchedule(
          charity.address,
          await token.getAddress(),
          TOTAL_AMOUNT,
          NUM_MONTHS,
          TOKEN_PRICE,
        );
    });

    it("Should allow donor to cancel schedule", async () => {
      await expect(distribution.connect(donor).cancelSchedule(0))
        .to.emit(distribution, "ScheduleCancelled")
        .withArgs(0);

      // Check schedule is inactive
      const schedule = await distribution.donationSchedules(0);
      expect(schedule.active).to.equal(false);
      expect(schedule.monthsRemaining).to.equal(0);

      // Check tokens returned to donor (original amount since no distributions occurred)
      expect(await token.balanceOf(donor.address)).to.equal(
        ethers.parseEther("100.0"), // Original 100 tokens minted
      );
    });

    it("Should not allow non-donor to cancel schedule", async () => {
      await expect(
        distribution.connect(charity).cancelSchedule(0),
      ).to.be.revertedWith("Not the donor");
    });
  });

  describe("Donor Schedules", () => {
    beforeEach(async () => {
      // Approve tokens for distribution contract
      await token
        .connect(donor)
        .approve(await distribution.getAddress(), TOTAL_AMOUNT * 2n);

      // Create two schedules
      await distribution
        .connect(donor)
        .createSchedule(
          charity.address,
          await token.getAddress(),
          TOTAL_AMOUNT,
          NUM_MONTHS,
          TOKEN_PRICE,
        );

      await distribution
        .connect(donor)
        .createSchedule(
          charity.address,
          await token.getAddress(),
          TOTAL_AMOUNT,
          NUM_MONTHS,
          TOKEN_PRICE,
        );
    });

    it("Should return all active schedules for a donor", async () => {
      const schedules = await distribution.getDonorSchedules(donor.address);
      expect(schedules.length).to.equal(2);
      expect(schedules[0]).to.equal(0);
      expect(schedules[1]).to.equal(1);
    });

    it("Should not include cancelled schedules", async () => {
      await distribution.connect(donor).cancelSchedule(0);

      const schedules = await distribution.getDonorSchedules(donor.address);
      expect(schedules.length).to.equal(1);
      expect(schedules[0]).to.equal(1);
    });
  });

  describe("Fee Management", () => {
    it("Should allow owner to update fee rate", async () => {
      const newFeeRate = 200n; // 2%

      await expect(distribution.updatePlatformFeeRate(newFeeRate))
        .to.emit(distribution, "PlatformFeeRateUpdated")
        .withArgs(FEE_RATE, newFeeRate);

      expect(await distribution.platformFeeRate()).to.equal(newFeeRate);
    });

    it("Should not allow fee rate above maximum", async () => {
      const excessiveFeeRate = 600n; // 6% - above 5% cap

      await expect(
        distribution.updatePlatformFeeRate(excessiveFeeRate),
      ).to.be.revertedWith("Fee rate exceeds maximum");
    });

    it("Should allow owner to update treasury", async () => {
      const newTreasury = ethers.Wallet.createRandom().address;

      await expect(distribution.updateTreasury(newTreasury))
        .to.emit(distribution, "TreasuryUpdated")
        .withArgs(treasury.address, newTreasury);

      expect(await distribution.treasury()).to.equal(newTreasury);
    });
  });
});
