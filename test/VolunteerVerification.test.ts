const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VolunteerVerification", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let verification: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _owner: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let charity: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let applicant: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let volunteer: any;

  beforeEach(async () => {
    [_owner, charity, applicant, volunteer] = await ethers.getSigners();

    // Deploy verification contract
    const VolunteerVerification = await ethers.getContractFactory(
      "VolunteerVerification",
    );
    verification = await VolunteerVerification.deploy();
  });

  describe("Charity Registration", () => {
    it("Should allow owner to register a charity", async () => {
      // Execute the transaction and check event was emitted
      const tx = await verification.registerCharity(charity.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(verification, "CharityRegistered")
        .withArgs(charity.address, block.timestamp);

      const charityInfo = await verification.charities(charity.address);
      expect(charityInfo.isRegistered).to.equal(true);
      expect(charityInfo.isActive).to.equal(true);
    });

    it("Should not allow non-owner to register a charity", async () => {
      await expect(
        verification.connect(charity).registerCharity(charity.address),
      ).to.be.revertedWithCustomError(
        verification,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Application Verification", () => {
    const applicationHash = ethers.keccak256(
      ethers.toUtf8Bytes("application1"),
    );

    beforeEach(async () => {
      await verification.registerCharity(charity.address);
    });

    it("Should allow charity to verify an application", async () => {
      const tx = await verification
        .connect(charity)
        .verifyApplication(applicationHash, applicant.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(verification, "ApplicationVerified")
        .withArgs(
          applicationHash,
          applicant.address,
          charity.address,
          block.timestamp,
        );

      const app =
        await verification.checkApplicationVerification(applicationHash);
      expect(app.isVerified).to.equal(true);
      expect(app.applicant).to.equal(applicant.address);
      expect(app.charity).to.equal(charity.address);
    });

    it("Should not allow non-charity to verify an application", async () => {
      await expect(
        verification
          .connect(applicant)
          .verifyApplication(applicationHash, applicant.address),
      ).to.be.revertedWithCustomError(verification, "CharityNotRegistered");
    });

    it("Should not allow verifying the same application twice", async () => {
      await verification
        .connect(charity)
        .verifyApplication(applicationHash, applicant.address);

      await expect(
        verification
          .connect(charity)
          .verifyApplication(applicationHash, applicant.address),
      ).to.be.revertedWithCustomError(verification, "HashAlreadyVerified");
    });
  });

  describe("Hours Verification", () => {
    const hoursHash = ethers.keccak256(ethers.toUtf8Bytes("hours1"));
    const hours = 8;

    beforeEach(async () => {
      await verification.registerCharity(charity.address);
    });

    it("Should allow charity to verify volunteer hours", async () => {
      const tx = await verification
        .connect(charity)
        .verifyHours(hoursHash, volunteer.address, hours);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(verification, "HoursVerified")
        .withArgs(
          hoursHash,
          volunteer.address,
          charity.address,
          hours,
          block.timestamp,
        );

      const hoursVerification =
        await verification.checkHoursVerification(hoursHash);
      expect(hoursVerification.isVerified).to.equal(true);
      expect(hoursVerification.volunteer).to.equal(volunteer.address);
      expect(hoursVerification.charity).to.equal(charity.address);
      expect(hoursVerification.hoursWorked).to.equal(hours);
    });

    it("Should not allow non-charity to verify hours", async () => {
      await expect(
        verification
          .connect(volunteer)
          .verifyHours(hoursHash, volunteer.address, hours),
      ).to.be.revertedWithCustomError(verification, "CharityNotRegistered");
    });

    it("Should not allow verifying the same hours twice", async () => {
      await verification
        .connect(charity)
        .verifyHours(hoursHash, volunteer.address, hours);

      await expect(
        verification
          .connect(charity)
          .verifyHours(hoursHash, volunteer.address, hours),
      ).to.be.revertedWithCustomError(verification, "HashAlreadyVerified");
    });
  });

  describe("Charity Status", () => {
    beforeEach(async () => {
      await verification.registerCharity(charity.address);
    });

    it("Should allow owner to deactivate a charity", async () => {
      await expect(verification.updateCharityStatus(charity.address, false))
        .to.emit(verification, "CharityStatusUpdated")
        .withArgs(charity.address, false);

      const charityInfo = await verification.charities(charity.address);
      expect(charityInfo.isActive).to.equal(false);
    });

    it("Should not allow inactive charity to verify applications", async () => {
      await verification.updateCharityStatus(charity.address, false);

      const applicationHash = ethers.keccak256(
        ethers.toUtf8Bytes("application2"),
      );

      await expect(
        verification
          .connect(charity)
          .verifyApplication(applicationHash, applicant.address),
      ).to.be.revertedWithCustomError(verification, "CharityNotActive");
    });
  });

  describe("Pausing", () => {
    beforeEach(async () => {
      await verification.registerCharity(charity.address);
    });

    it("Should allow owner to pause and unpause the contract", async () => {
      await verification.pause();

      const applicationHash = ethers.keccak256(
        ethers.toUtf8Bytes("application3"),
      );

      // OpenZeppelin 5.x uses custom error EnforcedPause()
      await expect(
        verification
          .connect(charity)
          .verifyApplication(applicationHash, applicant.address),
      ).to.be.revertedWithCustomError(verification, "EnforcedPause");

      await verification.unpause();

      await expect(
        verification
          .connect(charity)
          .verifyApplication(applicationHash, applicant.address),
      ).to.emit(verification, "ApplicationVerified");
    });
  });
});
