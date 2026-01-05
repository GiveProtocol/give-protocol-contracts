import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DurationDonation", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let donation: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _owner: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let charity: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let donor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let treasury: any;

  const FEE_RATE = 100n; // 1% in basis points
  const BASIS_POINTS = 10000n;

  beforeEach(async () => {
    [_owner, charity, donor, treasury] = await ethers.getSigners();

    // Deploy donation contract with treasury
    const DurationDonation =
      await ethers.getContractFactory("DurationDonation");
    donation = await DurationDonation.deploy(treasury.address);

    // Register charity
    await donation.registerCharity(charity.address);
  });

  describe("Charity Registration", () => {
    it("Should allow owner to register a charity", async () => {
      const newCharity = ethers.Wallet.createRandom().address;
      await expect(donation.registerCharity(newCharity))
        .to.emit(donation, "CharityRegistered");

      const charityInfo = await donation.getCharityInfo(newCharity);
      expect(charityInfo.isRegistered).to.equal(true);
    });

    it("Should not allow non-owner to register a charity", async () => {
      const newCharity = ethers.Wallet.createRandom().address;
      await expect(
        donation.connect(donor).registerCharity(newCharity),
      ).to.be.revertedWithCustomError(donation, "OwnableUnauthorizedAccount");
    });
  });

  describe("Native Token Donations with Fee", () => {
    it("Should process native donation with mandatory fee", async () => {
      const grossAmount = ethers.parseEther("1.0");
      const platformTip = 0n;
      const expectedFee = (grossAmount * FEE_RATE) / BASIS_POINTS;
      const expectedNetToCharity = grossAmount - expectedFee;

      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);
      const charityBalanceBefore = await ethers.provider.getBalance(charity.address);

      await donation.connect(donor).donateNative(charity.address, platformTip, {
        value: grossAmount,
      });

      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      const charityBalanceAfter = await ethers.provider.getBalance(charity.address);

      // Check fee went to treasury
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(expectedFee);
      // Check net amount went to charity
      expect(charityBalanceAfter - charityBalanceBefore).to.equal(expectedNetToCharity);
    });

    it("Should process native donation with fee and optional tip", async () => {
      const grossAmount = ethers.parseEther("1.0");
      const platformTip = ethers.parseEther("0.1"); // 10% optional tip
      const totalSent = grossAmount + platformTip;
      const expectedFee = (grossAmount * FEE_RATE) / BASIS_POINTS;
      const expectedNetToCharity = grossAmount - expectedFee;
      const expectedToTreasury = expectedFee + platformTip;

      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);

      await donation.connect(donor).donateNative(charity.address, platformTip, {
        value: totalSent,
      });

      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);

      // Check fee + tip went to treasury
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(expectedToTreasury);
    });
  });

  describe("Fee Management", () => {
    it("Should allow owner to update fee rate", async () => {
      const newFeeRate = 200n; // 2%

      await expect(donation.updatePlatformFeeRate(newFeeRate))
        .to.emit(donation, "PlatformFeeRateUpdated")
        .withArgs(FEE_RATE, newFeeRate);

      expect(await donation.platformFeeRate()).to.equal(newFeeRate);
    });

    it("Should not allow fee rate above maximum", async () => {
      const excessiveFeeRate = 600n; // 6% - above 5% cap

      await expect(
        donation.updatePlatformFeeRate(excessiveFeeRate),
      ).to.be.revertedWithCustomError(donation, "InvalidFeeRate");
    });
  });
});
