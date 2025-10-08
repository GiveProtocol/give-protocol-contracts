import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("VolunteerVerification", function () {
  let verification: Contract;
  let _owner: SignerWithAddress;
  let charity: SignerWithAddress;
  let applicant: SignerWithAddress;
  let volunteer: SignerWithAddress;

  beforeEach(async function () {
    [_owner, charity, applicant, volunteer] = await ethers.getSigners();

    // Deploy verification contract
    const VolunteerVerification = await ethers.getContractFactory(
      "VolunteerVerification",
    );
    verification = await VolunteerVerification.deploy();
  });

  describe("Charity Registration", function () {
    it("Should allow owner to register a charity", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      if (!latestBlock) {
        throw new Error("Could not get latest block");
      }
      const expectedTimestamp = latestBlock.timestamp;

      await expect(verification.registerCharity(charity.address))
        .to.emit(verification, "CharityRegistered")
        .withArgs(charity.address, expectedTimestamp);

      const charityInfo = await verification.charities(charity.address);
      expect(charityInfo.isRegistered).to.equal(true);
      expect(charityInfo.isActive).to.equal(true);
    });

    it("Should not allow non-owner to register a charity", async function () {
      await expect(
        verification.connect(charity).registerCharity(charity.address),
      ).to.be.revertedWithCustomError(
        verification,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Application Verification", function () {
    const applicationHash = ethers.keccak256(
      ethers.toUtf8Bytes("application1"),
    );

    beforeEach(async function () {
      await verification.registerCharity(charity.address);
    });

    it("Should allow charity to verify an application", async function () {
      await expect(
        verification
          .connect(charity)
          .verifyApplication(applicationHash, applicant.address),
      )
        .to.emit(verification, "ApplicationVerified")
        .withArgs(
          applicationHash,
          applicant.address,
          charity.address,
          await ethers.provider.getBlock("latest").then((b) => b.timestamp),
        );

      const app =
        await verification.checkApplicationVerification(applicationHash);
      expect(app.isVerified).to.equal(true);
      expect(app.applicant).to.equal(applicant.address);
      expect(app.charity).to.equal(charity.address);
    });

    it("Should not allow non-charity to verify an application", async function () {
      await expect(
        verification
          .connect(applicant)
          .verifyApplication(applicationHash, applicant.address),
      ).to.be.revertedWithCustomError(verification, "CharityNotRegistered");
    });

    it("Should not allow verifying the same application twice", async function () {
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

  describe("Hours Verification", function () {
    const hoursHash = ethers.keccak256(ethers.toUtf8Bytes("hours1"));
    const hours = 8;

    beforeEach(async function () {
      await verification.registerCharity(charity.address);
    });

    it("Should allow charity to verify volunteer hours", async function () {
      await expect(
        verification
          .connect(charity)
          .verifyHours(hoursHash, volunteer.address, hours),
      )
        .to.emit(verification, "HoursVerified")
        .withArgs(
          hoursHash,
          volunteer.address,
          charity.address,
          hours,
          await ethers.provider.getBlock("latest").then((b) => b.timestamp),
        );

      const hoursVerification =
        await verification.checkHoursVerification(hoursHash);
      expect(hoursVerification.isVerified).to.equal(true);
      expect(hoursVerification.volunteer).to.equal(volunteer.address);
      expect(hoursVerification.charity).to.equal(charity.address);
      expect(hoursVerification.hours).to.equal(hours);
    });

    it("Should not allow non-charity to verify hours", async function () {
      await expect(
        verification
          .connect(volunteer)
          .verifyHours(hoursHash, volunteer.address, hours),
      ).to.be.revertedWithCustomError(verification, "CharityNotRegistered");
    });

    it("Should not allow verifying the same hours twice", async function () {
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

  describe("Charity Status", function () {
    beforeEach(async function () {
      await verification.registerCharity(charity.address);
    });

    it("Should allow owner to deactivate a charity", async function () {
      await expect(verification.updateCharityStatus(charity.address, false))
        .to.emit(verification, "CharityStatusUpdated")
        .withArgs(charity.address, false);

      const charityInfo = await verification.charities(charity.address);
      expect(charityInfo.isActive).to.equal(false);
    });

    it("Should not allow inactive charity to verify applications", async function () {
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

  describe("Pausing", function () {
    beforeEach(async function () {
      await verification.registerCharity(charity.address);
    });

    it("Should allow owner to pause and unpause the contract", async function () {
      await verification.pause();

      const applicationHash = ethers.keccak256(
        ethers.toUtf8Bytes("application3"),
      );

      await expect(
        verification
          .connect(charity)
          .verifyApplication(applicationHash, applicant.address),
      ).to.be.revertedWith("Pausable: paused");

      await verification.unpause();

      await expect(
        verification
          .connect(charity)
          .verifyApplication(applicationHash, applicant.address),
      ).to.emit(verification, "ApplicationVerified");
    });
  });
});
