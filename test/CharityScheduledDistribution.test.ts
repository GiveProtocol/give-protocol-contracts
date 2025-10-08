import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CharityScheduledDistribution", function () {
  let distribution: Contract;
  let executor: Contract;
  let token: Contract;
  let _owner: SignerWithAddress;
  let charity: SignerWithAddress;
  let donor: SignerWithAddress;

  const TOKEN_PRICE = BigInt(100 * 10 ** 8); // $100 USD with 8 decimals
  const TOTAL_AMOUNT = ethers.parseEther("12.0"); // 12 tokens
  const MONTHLY_AMOUNT = ethers.parseEther("1.0"); // 1 token per month

  beforeEach(async function () {
    [_owner, charity, donor] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("Mock Token", "MTK");
    await token.mint(donor.address, ethers.parseEther("100.0"));

    // Deploy distribution contract
    const CharityScheduledDistribution = await ethers.getContractFactory(
      "CharityScheduledDistribution",
    );
    distribution = await CharityScheduledDistribution.deploy();

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

  describe("Charity Management", function () {
    it("Should allow owner to add and remove charities", async function () {
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

    it("Should not allow non-owner to add charities", async function () {
      const newCharity = ethers.Wallet.createRandom().address;

      await expect(
        distribution.connect(donor).addCharity(newCharity),
      ).to.be.revertedWithCustomError(
        distribution,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Token Price Management", function () {
    it("Should allow owner to set token prices", async function () {
      const newToken = ethers.Wallet.createRandom().address;
      const newPrice = BigInt(200 * 10 ** 8); // $200 USD

      await expect(distribution.setTokenPrice(newToken, newPrice))
        .to.emit(distribution, "TokenPriceSet")
        .withArgs(newToken, newPrice);

      expect(await distribution.tokenPrices(newToken)).to.equal(newPrice);
    });

    it("Should not allow non-owner to set token prices", async function () {
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

  describe("Schedule Creation", function () {
    beforeEach(async function () {
      // Approve tokens for distribution contract
      await token
        .connect(donor)
        .approve(await distribution.getAddress(), TOTAL_AMOUNT);
    });

    it("Should create a monthly distribution schedule", async function () {
      await expect(
        distribution
          .connect(donor)
          .createSchedule(
            charity.address,
            await token.getAddress(),
            TOTAL_AMOUNT,
          ),
      )
        .to.emit(distribution, "ScheduleCreated")
        .withArgs(
          1, // scheduleId
          donor.address,
          charity.address,
          await token.getAddress(),
          TOTAL_AMOUNT,
          MONTHLY_AMOUNT,
          12, // months
        );

      const schedule = await distribution.donationSchedules(1);
      expect(schedule.donor).to.equal(donor.address);
      expect(schedule.charity).to.equal(charity.address);
      expect(schedule.token).to.equal(await token.getAddress());
      expect(schedule.totalAmount).to.equal(TOTAL_AMOUNT);
      expect(schedule.amountPerMonth).to.equal(MONTHLY_AMOUNT);
      expect(schedule.monthsRemaining).to.equal(12);
      expect(schedule.active).to.equal(true);
    });

    it("Should not create schedule for unverified charity", async function () {
      const unverifiedCharity = ethers.Wallet.createRandom().address;

      await expect(
        distribution
          .connect(donor)
          .createSchedule(
            unverifiedCharity,
            await token.getAddress(),
            TOTAL_AMOUNT,
          ),
      ).to.be.revertedWith("Charity not verified");
    });

    it("Should not create schedule for unsupported token", async function () {
      const unsupportedToken = ethers.Wallet.createRandom().address;

      await expect(
        distribution
          .connect(donor)
          .createSchedule(charity.address, unsupportedToken, TOTAL_AMOUNT),
      ).to.be.revertedWith("Token not supported");
    });
  });

  describe("Distribution Execution", function () {
    beforeEach(async function () {
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
        );
    });

    it("Should not distribute before the interval has passed", async function () {
      await distribution.executeDistributions([1]);

      // No distribution should have occurred
      const schedule = await distribution.donationSchedules(1);
      expect(schedule.monthsRemaining).to.equal(12);
      expect(await token.balanceOf(charity.address)).to.equal(0);
    });

    it("Should distribute after the interval has passed", async function () {
      // Advance time by 31 days
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await expect(distribution.executeDistributions([1]))
        .to.emit(distribution, "DistributionExecuted")
        .withArgs(
          1, // scheduleId
          charity.address,
          await token.getAddress(),
          MONTHLY_AMOUNT,
          11, // monthsRemaining
        );

      // Check distribution occurred
      const schedule = await distribution.donationSchedules(1);
      expect(schedule.monthsRemaining).to.equal(11);
      expect(await token.balanceOf(charity.address)).to.equal(MONTHLY_AMOUNT);
    });

    it("Should execute distributions via the executor contract", async function () {
      // Advance time by 31 days
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await executor.executeDistributionBatch(1, 1);

      // Check distribution occurred
      const schedule = await distribution.donationSchedules(1);
      expect(schedule.monthsRemaining).to.equal(11);
      expect(await token.balanceOf(charity.address)).to.equal(MONTHLY_AMOUNT);
    });
  });

  describe("Schedule Cancellation", function () {
    beforeEach(async function () {
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
        );
    });

    it("Should allow donor to cancel schedule", async function () {
      await expect(distribution.connect(donor).cancelSchedule(1))
        .to.emit(distribution, "ScheduleCancelled")
        .withArgs(1);

      // Check schedule is inactive
      const schedule = await distribution.donationSchedules(1);
      expect(schedule.active).to.equal(false);
      expect(schedule.monthsRemaining).to.equal(0);

      // Check tokens returned to donor
      expect(await token.balanceOf(donor.address)).to.equal(TOTAL_AMOUNT);
    });

    it("Should not allow non-donor to cancel schedule", async function () {
      await expect(
        distribution.connect(charity).cancelSchedule(1),
      ).to.be.revertedWith("Not the donor");
    });
  });

  describe("Donor Schedules", function () {
    beforeEach(async function () {
      // Approve tokens for distribution contract
      await token
        .connect(donor)
        .approve(await distribution.getAddress(), TOTAL_AMOUNT.mul(2));

      // Create two schedules
      await distribution
        .connect(donor)
        .createSchedule(
          charity.address,
          await token.getAddress(),
          TOTAL_AMOUNT,
        );

      await distribution
        .connect(donor)
        .createSchedule(
          charity.address,
          await token.getAddress(),
          TOTAL_AMOUNT,
        );
    });

    it("Should return all active schedules for a donor", async function () {
      const schedules = await distribution.getDonorSchedules(donor.address);
      expect(schedules.length).to.equal(2);
      expect(schedules[0]).to.equal(1);
      expect(schedules[1]).to.equal(2);
    });

    it("Should not include cancelled schedules", async function () {
      await distribution.connect(donor).cancelSchedule(1);

      const schedules = await distribution.getDonorSchedules(donor.address);
      expect(schedules.length).to.equal(1);
      expect(schedules[0]).to.equal(2);
    });
  });
});
