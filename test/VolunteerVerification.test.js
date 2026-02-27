const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("VolunteerVerification", () => {
  let verification = null;
  let owner = null;
  let charity = null;
  let applicant = null;
  let volunteer = null;
  let nonOwner = null;

  beforeEach(async () => {
    [owner, charity, applicant, volunteer, nonOwner] = await ethers.getSigners();

    // Deploy verification contract via proxy
    const VolunteerVerification = await ethers.getContractFactory(
      "VolunteerVerification",
    );
    verification = await hre.upgrades.deployProxy(
      VolunteerVerification,
      [owner.address],
      { initializer: "initialize", kind: "uups" },
    );
    await verification.waitForDeployment();
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

  describe("Upgradeability", () => {
    it("Should not allow initialize to be called twice", async () => {
      await expect(
        verification.initialize(owner.address),
      ).to.be.revertedWithCustomError(verification, "InvalidInitialization");
    });

    it("Should allow owner to upgrade", async () => {
      const V2 = await ethers.getContractFactory("VolunteerVerification");
      const upgraded = await hre.upgrades.upgradeProxy(
        await verification.getAddress(),
        V2,
        { kind: "uups" },
      );
      expect(await upgraded.getAddress()).to.equal(
        await verification.getAddress(),
      );
    });

    it("Should reject unauthorized upgrade", async () => {
      const V2 = await ethers.getContractFactory(
        "VolunteerVerification",
        nonOwner,
      );
      await expect(
        hre.upgrades.upgradeProxy(await verification.getAddress(), V2, {
          kind: "uups",
        }),
      ).to.be.revertedWithCustomError(
        verification,
        "OwnableUnauthorizedAccount",
      );
    });

    it("Should preserve state across upgrade", async () => {
      // Write state
      await verification.registerCharity(charity.address);

      const charityInfoBefore = await verification.charities(charity.address);
      expect(charityInfoBefore.isRegistered).to.equal(true);

      // Upgrade
      const V2 = await ethers.getContractFactory("VolunteerVerification");
      const upgraded = await hre.upgrades.upgradeProxy(
        await verification.getAddress(),
        V2,
        { kind: "uups" },
      );

      // Verify state preserved
      const charityInfoAfter = await upgraded.charities(charity.address);
      expect(charityInfoAfter.isRegistered).to.equal(true);
      expect(charityInfoAfter.isActive).to.equal(true);
    });

    it("Should keep same proxy address after upgrade", async () => {
      const proxyAddr = await verification.getAddress();
      const V2 = await ethers.getContractFactory("VolunteerVerification");
      const upgraded = await hre.upgrades.upgradeProxy(proxyAddr, V2, {
        kind: "uups",
      });
      expect(await upgraded.getAddress()).to.equal(proxyAddr);
    });

    it("Should emit Upgraded event with new implementation address", async () => {
      const V2 = await ethers.getContractFactory("VolunteerVerification");
      const v2Impl = await V2.deploy();
      await v2Impl.waitForDeployment();
      const v2Addr = await v2Impl.getAddress();

      await expect(verification.upgradeToAndCall(v2Addr, "0x"))
        .to.emit(verification, "Upgraded")
        .withArgs(v2Addr);
    });

    it("Should preserve verification records across upgrade", async () => {
      // Write verification state
      await verification.registerCharity(charity.address);
      const applicationHash = ethers.keccak256(ethers.toUtf8Bytes("upgrade-app"));
      await verification.connect(charity).verifyApplication(applicationHash, applicant.address);
      const hoursHash = ethers.keccak256(ethers.toUtf8Bytes("upgrade-hours"));
      await verification.connect(charity).verifyHours(hoursHash, volunteer.address, 10);

      // Upgrade
      const V2 = await ethers.getContractFactory("VolunteerVerification");
      const upgraded = await hre.upgrades.upgradeProxy(
        await verification.getAddress(), V2, { kind: "uups" },
      );

      // Verify all state preserved
      const app = await upgraded.checkApplicationVerification(applicationHash);
      expect(app.isVerified).to.equal(true);
      expect(app.applicant).to.equal(applicant.address);
      expect(app.charity).to.equal(charity.address);

      const hours = await upgraded.checkHoursVerification(hoursHash);
      expect(hours.isVerified).to.equal(true);
      expect(hours.volunteer).to.equal(volunteer.address);
      expect(hours.hoursWorked).to.equal(10);
    });
  });
});
