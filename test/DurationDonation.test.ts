import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("DurationDonation", () => {
  let donation: Contract;
  let _owner: SignerWithAddress;
  let charity: SignerWithAddress;
  let donor: SignerWithAddress;

  beforeEach(async () => {
    [_owner, charity, donor] = await ethers.getSigners();

    // Deploy donation contract
    const DurationDonation =
      await ethers.getContractFactory("DurationDonation");
    donation = await DurationDonation.deploy();
  });

  describe("Charity Registration", () => {
    it("Should allow owner to register a charity", async () => {
      await expect(donation.registerCharity(charity.address))
        .to.emit(donation, "CharityRegistered")
        .withArgs(charity.address);

      const charityInfo = await donation.getCharityInfo(charity.address);
      expect(charityInfo.isRegistered).to.equal(true);
    });

    it("Should not allow non-owner to register a charity", async () => {
      await expect(
        donation.connect(donor).registerCharity(charity.address),
      ).to.be.revertedWithCustomError(donation, "OwnableUnauthorizedAccount");
    });
  });

  describe("Donations", () => {
    beforeEach(async () => {
      await donation.registerCharity(charity.address);
    });

    it("Should allow native token donations", async () => {
      const amount = ethers.parseEther("1.0");

      await expect(
        donation.connect(donor).donate(charity.address, { value: amount }),
      )
        .to.emit(donation, "DonationReceived")
        .withArgs(donor.address, charity.address, amount);

      const charityInfo = await donation.getCharityInfo(charity.address);
      expect(charityInfo.totalReceived).to.equal(amount);
      expect(charityInfo.availableBalance).to.equal(amount);
    });
  });

  describe("Withdrawals", () => {
    const donationAmount = ethers.parseEther("1.0");

    beforeEach(async () => {
      await donation.registerCharity(charity.address);
      await donation
        .connect(donor)
        .donate(charity.address, { value: donationAmount });
    });

    it("Should allow charity to withdraw", async () => {
      await expect(donation.connect(charity).withdraw(donationAmount))
        .to.emit(donation, "WithdrawalProcessed")
        .withArgs(charity.address, donationAmount);

      const charityInfo = await donation.getCharityInfo(charity.address);
      expect(charityInfo.availableBalance).to.equal(0);
    });

    it("Should not allow withdrawal more than available balance", async () => {
      const excessAmount = ethers.parseEther("2.0");
      await expect(
        donation.connect(charity).withdraw(excessAmount),
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should not allow non-charity to withdraw", async () => {
      await expect(
        donation.connect(donor).withdraw(donationAmount),
      ).to.be.revertedWith("Not a registered charity");
    });
  });
});
