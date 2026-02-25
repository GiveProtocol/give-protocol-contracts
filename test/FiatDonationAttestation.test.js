const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("FiatDonationAttestation", () => {
  let attestation = null;
  let admin = null;
  let attester = null;
  let charity1 = null;
  let charity2 = null;
  let unauthorized = null;

  // Hardhat default chain ID
  const HARDHAT_CHAIN_ID = 31337n;

  const USD = ethers.encodeBytes32String("USD").slice(0, 8); // bytes3
  const CAD = ethers.encodeBytes32String("CAD").slice(0, 8);
  const EUR = ethers.encodeBytes32String("EUR").slice(0, 8);

  // Helper: generate a unique off-chain reference hash
  function refHash(id) {
    return ethers.keccak256(ethers.toUtf8Bytes(`helcim-tx-${id}`));
  }

  // Helper: register a charity
  async function registerCharity(charityAddr) {
    await attestation.registerCharity(charityAddr);
  }

  // Helper: attest a donation and return the attestation hash
  async function attestDonation(charity, amountInCents, currency, ref) {
    const tx = await attestation.connect(attester).attest(charity, amountInCents, currency, ref);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => {
        try {
          const parsed = attestation.interface.parseLog(log);
          return parsed && parsed.name === "AttestationRecorded";
        } catch { return false; }
      }
    );
    const parsed = attestation.interface.parseLog(event);
    return parsed.args.attestationHash;
  }

  beforeEach(async () => {
    [admin, attester, charity1, charity2, unauthorized] = await ethers.getSigners();

    const FiatDonationAttestation = await ethers.getContractFactory("FiatDonationAttestation");
    attestation = await hre.upgrades.deployProxy(
      FiatDonationAttestation,
      [HARDHAT_CHAIN_ID, admin.address],
      { initializer: "initialize", kind: "uups" },
    );
    await attestation.waitForDeployment();

    // Grant ATTESTER_ROLE to attester
    const ATTESTER_ROLE = await attestation.ATTESTER_ROLE();
    await attestation.grantRole(ATTESTER_ROLE, attester.address);
  });

  // ──────────────────────────────────────────────
  // 1. Deployment
  // ──────────────────────────────────────────────
  describe("Deployment", () => {
    it("Should set the correct canonical chain ID", async () => {
      expect(await attestation.canonicalChainId()).to.equal(HARDHAT_CHAIN_ID);
    });

    it("Should grant DEFAULT_ADMIN_ROLE to admin", async () => {
      const DEFAULT_ADMIN_ROLE = await attestation.DEFAULT_ADMIN_ROLE();
      expect(await attestation.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
    });

    it("Should grant ADMIN_ROLE to admin", async () => {
      const ADMIN_ROLE = await attestation.ADMIN_ROLE();
      expect(await attestation.hasRole(ADMIN_ROLE, admin.address)).to.equal(true);
    });

    it("Should initialize attestation count to zero", async () => {
      expect(await attestation.getAttestationCount()).to.equal(0);
    });

    it("Should revert with zero admin address", async () => {
      const FiatDonationAttestation = await ethers.getContractFactory("FiatDonationAttestation");
      await expect(
        hre.upgrades.deployProxy(
          FiatDonationAttestation,
          [HARDHAT_CHAIN_ID, ethers.ZeroAddress],
          { initializer: "initialize", kind: "uups" },
        ),
      ).to.be.revertedWith("Invalid admin address");
    });

    it("Should revert with zero canonical chain ID", async () => {
      const FiatDonationAttestation = await ethers.getContractFactory("FiatDonationAttestation");
      await expect(
        hre.upgrades.deployProxy(
          FiatDonationAttestation,
          [0, admin.address],
          { initializer: "initialize", kind: "uups" },
        ),
      ).to.be.revertedWith("Invalid canonical chain ID");
    });
  });

  // ──────────────────────────────────────────────
  // 2. Charity Registry
  // ──────────────────────────────────────────────
  describe("Charity Registry", () => {
    it("Should register a charity", async () => {
      await expect(attestation.registerCharity(charity1.address))
        .to.emit(attestation, "CharityRegistered")
        .withArgs(charity1.address, (ts) => ts > 0);

      const [isRegistered, isActive] = await attestation.getCharityInfo(charity1.address);
      expect(isRegistered).to.equal(true);
      expect(isActive).to.equal(true);
    });

    it("Should reject duplicate charity registration", async () => {
      await attestation.registerCharity(charity1.address);
      await expect(attestation.registerCharity(charity1.address))
        .to.be.revertedWith("Charity already registered");
    });

    it("Should reject zero address charity", async () => {
      await expect(attestation.registerCharity(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid charity address");
    });

    it("Should reject non-ADMIN_ROLE caller", async () => {
      await expect(
        attestation.connect(unauthorized).registerCharity(charity1.address)
      ).to.be.reverted;
    });

    it("Should deactivate a charity", async () => {
      await attestation.registerCharity(charity1.address);
      await expect(attestation.updateCharityStatus(charity1.address, false))
        .to.emit(attestation, "CharityStatusUpdated")
        .withArgs(charity1.address, false);

      const [, isActive] = await attestation.getCharityInfo(charity1.address);
      expect(isActive).to.equal(false);
    });

    it("Should reactivate a charity", async () => {
      await attestation.registerCharity(charity1.address);
      await attestation.updateCharityStatus(charity1.address, false);
      await attestation.updateCharityStatus(charity1.address, true);

      const [, isActive] = await attestation.getCharityInfo(charity1.address);
      expect(isActive).to.equal(true);
    });

    it("Should reject status update for unregistered charity", async () => {
      await expect(attestation.updateCharityStatus(charity1.address, false))
        .to.be.revertedWith("Charity not registered");
    });
  });

  // ──────────────────────────────────────────────
  // 3. Individual Attestation
  // ──────────────────────────────────────────────
  describe("Individual Attestation", () => {
    beforeEach(async () => {
      await registerCharity(charity1.address);
    });

    it("Should create an attestation with correct fields", async () => {
      const ref = refHash("001");
      const hash = await attestDonation(charity1.address, 5000, USD, ref);

      const record = await attestation.getAttestation(hash);
      expect(record.attestationHash).to.equal(hash);
      expect(record.charity).to.equal(charity1.address);
      expect(record.amountInCents).to.equal(5000);
      expect(record.currencyCode).to.equal(USD);
      expect(record.attestedAt).to.be.gt(0);
      expect(record.offChainRefHash).to.equal(ref);
      expect(record.status).to.equal(0); // Pending
    });

    it("Should compute correct attestation hash", async () => {
      const ref = refHash("002");
      const tx = await attestation.connect(attester).attest(charity1.address, 10000, USD, ref);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const expectedHash = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "uint256", "bytes3", "uint256", "bytes32"],
          [charity1.address, 10000, USD, block.timestamp, ref]
        )
      );

      const event = receipt.logs.find((log) => {
        try {
          return attestation.interface.parseLog(log)?.name === "AttestationRecorded";
        } catch { return false; }
      });
      const parsed = attestation.interface.parseLog(event);
      expect(parsed.args.attestationHash).to.equal(expectedHash);
    });

    it("Should increment attestation count", async () => {
      await attestDonation(charity1.address, 5000, USD, refHash("003"));
      expect(await attestation.getAttestationCount()).to.equal(1);

      await attestDonation(charity1.address, 3000, USD, refHash("004"));
      expect(await attestation.getAttestationCount()).to.equal(2);
    });

    it("Should update aggregates", async () => {
      await attestDonation(charity1.address, 5000, USD, refHash("005"));
      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(5000);

      await attestDonation(charity1.address, 3000, USD, refHash("006"));
      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(8000);
    });

    it("Should emit AttestationRecorded event", async () => {
      const ref = refHash("007");
      await expect(
        attestation.connect(attester).attest(charity1.address, 5000, USD, ref)
      ).to.emit(attestation, "AttestationRecorded");
    });

    it("Should reject unregistered charity", async () => {
      await expect(
        attestation.connect(attester).attest(charity2.address, 5000, USD, refHash("008"))
      ).to.be.revertedWith("Charity not registered");
    });

    it("Should reject inactive charity", async () => {
      await attestation.updateCharityStatus(charity1.address, false);
      await expect(
        attestation.connect(attester).attest(charity1.address, 5000, USD, refHash("009"))
      ).to.be.revertedWith("Charity not active");
    });

    it("Should reject zero amount", async () => {
      await expect(
        attestation.connect(attester).attest(charity1.address, 0, USD, refHash("010"))
      ).to.be.revertedWith("Amount must be greater than zero");
    });

    it("Should reject empty currency code", async () => {
      await expect(
        attestation.connect(attester).attest(charity1.address, 5000, "0x000000", refHash("011"))
      ).to.be.revertedWith("Invalid currency code");
    });

    it("Should reject empty reference hash", async () => {
      await expect(
        attestation.connect(attester).attest(charity1.address, 5000, USD, ethers.ZeroHash)
      ).to.be.revertedWith("Invalid reference hash");
    });

    it("Should reject non-ATTESTER_ROLE caller", async () => {
      await expect(
        attestation.connect(unauthorized).attest(charity1.address, 5000, USD, refHash("012"))
      ).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────
  // 4. Batch Attestation
  // ──────────────────────────────────────────────
  describe("Batch Attestation", () => {
    beforeEach(async () => {
      await registerCharity(charity1.address);
      await registerCharity(charity2.address);
    });

    it("Should create multiple attestations in one tx", async () => {
      const tx = await attestation.connect(attester).batchAttest(
        [charity1.address, charity2.address],
        [5000, 3000],
        [USD, USD],
        [refHash("b01"), refHash("b02")]
      );
      await tx.wait();

      expect(await attestation.getAttestationCount()).to.equal(2);
      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(5000);
      expect(await attestation.getTotalAttested(charity2.address, USD)).to.equal(3000);
    });

    it("Should emit BatchAttestationRecorded event", async () => {
      await expect(
        attestation.connect(attester).batchAttest(
          [charity1.address, charity2.address],
          [5000, 3000],
          [USD, USD],
          [refHash("b03"), refHash("b04")]
        )
      ).to.emit(attestation, "BatchAttestationRecorded")
        .withArgs(2, 8000, USD);
    });

    it("Should return attestation hashes", async () => {
      // Use staticCall to get return value
      const hashes = await attestation.connect(attester).batchAttest.staticCall(
        [charity1.address, charity2.address],
        [5000, 3000],
        [USD, USD],
        [refHash("b05"), refHash("b06")]
      );
      expect(hashes.length).to.equal(2);
      expect(hashes[0]).to.not.equal(ethers.ZeroHash);
      expect(hashes[1]).to.not.equal(ethers.ZeroHash);
    });

    it("Should reject mismatched array lengths", async () => {
      await expect(
        attestation.connect(attester).batchAttest(
          [charity1.address, charity2.address],
          [5000],
          [USD, USD],
          [refHash("b07"), refHash("b08")]
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("Should reject empty batch", async () => {
      await expect(
        attestation.connect(attester).batchAttest([], [], [], [])
      ).to.be.revertedWith("Invalid batch size");
    });

    it("Should reject batch exceeding MAX_BATCH_SIZE", async () => {
      const size = 51;
      const addrs = Array(size).fill(charity1.address);
      const amounts = Array(size).fill(1000);
      const currs = Array(size).fill(USD);
      const refs = Array.from({ length: size }, (_, i) => refHash(`over-${i}`));

      await expect(
        attestation.connect(attester).batchAttest(addrs, amounts, currs, refs)
      ).to.be.revertedWith("Invalid batch size");
    });

    it("Should be atomic — revert all if one fails", async () => {
      // Second attestation uses duplicate ref hash
      const dup = refHash("b-dup");
      await attestDonation(charity1.address, 1000, USD, dup);

      await expect(
        attestation.connect(attester).batchAttest(
          [charity1.address, charity1.address],
          [5000, 3000],
          [USD, USD],
          [refHash("b-new"), dup]
        )
      ).to.be.revertedWith("Reference already processed");

      // First attestation in the batch should not have been recorded
      expect(await attestation.getAttestationCount()).to.equal(1);
    });

    it("Should handle mixed charities and currencies", async () => {
      await attestation.connect(attester).batchAttest(
        [charity1.address, charity2.address, charity1.address],
        [5000, 3000, 2000],
        [USD, CAD, EUR],
        [refHash("b-mix1"), refHash("b-mix2"), refHash("b-mix3")]
      );

      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(5000);
      expect(await attestation.getTotalAttested(charity2.address, CAD)).to.equal(3000);
      expect(await attestation.getTotalAttested(charity1.address, EUR)).to.equal(2000);
    });
  });

  // ──────────────────────────────────────────────
  // 5. Reversal
  // ──────────────────────────────────────────────
  describe("Reversal", () => {
    let attestHash = null;

    beforeEach(async () => {
      await registerCharity(charity1.address);
      attestHash = await attestDonation(charity1.address, 5000, USD, refHash("rev-001"));
    });

    it("Should reverse an attestation", async () => {
      await attestation.connect(attester).reverseAttestation(attestHash);

      const record = await attestation.getAttestation(attestHash);
      expect(record.status).to.equal(2); // Reversed
    });

    it("Should decrement aggregates on reversal", async () => {
      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(5000);

      await attestation.connect(attester).reverseAttestation(attestHash);

      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(0);
    });

    it("Should emit correct events on reversal", async () => {
      await expect(attestation.connect(attester).reverseAttestation(attestHash))
        .to.emit(attestation, "AttestationStatusUpdated")
        .withArgs(attestHash, 0, 2) // Pending → Reversed
        .and.to.emit(attestation, "AttestationReversed")
        .withArgs(attestHash, 5000);
    });

    it("Should reject reversal of non-existent attestation", async () => {
      await expect(
        attestation.connect(attester).reverseAttestation(ethers.ZeroHash)
      ).to.be.revertedWith("Attestation not found");
    });

    it("Should reject reversal of already-reversed attestation", async () => {
      await attestation.connect(attester).reverseAttestation(attestHash);
      await expect(
        attestation.connect(attester).reverseAttestation(attestHash)
      ).to.be.revertedWith("Already reversed");
    });

    it("Should reject reversal by non-ATTESTER_ROLE", async () => {
      await expect(
        attestation.connect(unauthorized).reverseAttestation(attestHash)
      ).to.be.reverted;
    });

    it("Should batch reverse multiple attestations", async () => {
      const hash2 = await attestDonation(charity1.address, 3000, USD, refHash("rev-002"));
      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(8000);

      await attestation.connect(attester).batchReverseAttestations([attestHash, hash2]);

      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(0);
      expect((await attestation.getAttestation(attestHash)).status).to.equal(2);
      expect((await attestation.getAttestation(hash2)).status).to.equal(2);
    });

    it("Should reject empty batch reversal", async () => {
      await expect(
        attestation.connect(attester).batchReverseAttestations([])
      ).to.be.revertedWith("Invalid batch size");
    });
  });

  // ──────────────────────────────────────────────
  // 6. Deduplication
  // ──────────────────────────────────────────────
  describe("Deduplication", () => {
    beforeEach(async () => {
      await registerCharity(charity1.address);
    });

    it("Should reject duplicate offChainRefHash", async () => {
      const ref = refHash("dedup-001");
      await attestDonation(charity1.address, 5000, USD, ref);

      await expect(
        attestation.connect(attester).attest(charity1.address, 5000, USD, ref)
      ).to.be.revertedWith("Reference already processed");
    });

    it("Should mark ref hash as processed", async () => {
      const ref = refHash("dedup-002");
      expect(await attestation.isRefHashProcessed(ref)).to.equal(false);

      await attestDonation(charity1.address, 5000, USD, ref);

      expect(await attestation.isRefHashProcessed(ref)).to.equal(true);
    });

    it("Should allow different ref hash for same charity and amount", async () => {
      await attestDonation(charity1.address, 5000, USD, refHash("dedup-003"));
      await attestDonation(charity1.address, 5000, USD, refHash("dedup-004"));

      expect(await attestation.getAttestationCount()).to.equal(2);
      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(10000);
    });
  });

  // ──────────────────────────────────────────────
  // 7. Canonical Chain
  // ──────────────────────────────────────────────
  describe("Canonical Chain", () => {
    beforeEach(async () => {
      await registerCharity(charity1.address);
    });

    it("Should accept attestations on canonical chain", async () => {
      // Hardhat is 31337 and we set canonical to 31337
      await attestDonation(charity1.address, 5000, USD, refHash("chain-001"));
      expect(await attestation.getAttestationCount()).to.equal(1);
    });

    it("Should reject attestations on non-canonical chain", async () => {
      // Change canonical to a different chain
      await attestation.updateCanonicalChainId(8453);

      await expect(
        attestation.connect(attester).attest(charity1.address, 5000, USD, refHash("chain-002"))
      ).to.be.revertedWith("Attestations disabled on non-canonical chain");
    });

    it("Should allow ADMIN_ROLE to update canonical chain ID", async () => {
      await expect(attestation.updateCanonicalChainId(8453))
        .to.emit(attestation, "CanonicalChainUpdated")
        .withArgs(HARDHAT_CHAIN_ID, 8453);

      expect(await attestation.canonicalChainId()).to.equal(8453);
    });

    it("Should reject zero chain ID", async () => {
      await expect(attestation.updateCanonicalChainId(0))
        .to.be.revertedWith("Invalid chain ID");
    });

    it("Should reject non-ADMIN_ROLE updating chain ID", async () => {
      await expect(
        attestation.connect(unauthorized).updateCanonicalChainId(8453)
      ).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────
  // 8. Access Control
  // ──────────────────────────────────────────────
  describe("Access Control", () => {
    it("Should have DEFAULT_ADMIN_ROLE manage other roles", async () => {
      const ATTESTER_ROLE = await attestation.ATTESTER_ROLE();
      // Admin can grant ATTESTER_ROLE (already done in beforeEach)
      expect(await attestation.hasRole(ATTESTER_ROLE, attester.address)).to.equal(true);

      // Admin can revoke ATTESTER_ROLE
      await attestation.revokeRole(ATTESTER_ROLE, attester.address);
      expect(await attestation.hasRole(ATTESTER_ROLE, attester.address)).to.equal(false);
    });

    it("Should enforce ADMIN_ROLE for charity management", async () => {
      await expect(
        attestation.connect(attester).registerCharity(charity1.address)
      ).to.be.reverted;
    });

    it("Should enforce ATTESTER_ROLE for attestations", async () => {
      await registerCharity(charity1.address);
      await expect(
        attestation.connect(unauthorized).attest(charity1.address, 5000, USD, refHash("ac-001"))
      ).to.be.reverted;
    });

    it("Should enforce ATTESTER_ROLE for reversals", async () => {
      await registerCharity(charity1.address);
      const hash = await attestDonation(charity1.address, 5000, USD, refHash("ac-002"));
      await expect(
        attestation.connect(unauthorized).reverseAttestation(hash)
      ).to.be.reverted;
    });

    it("Should enforce ADMIN_ROLE for pause/unpause", async () => {
      await expect(attestation.connect(unauthorized).pause()).to.be.reverted;
      await expect(attestation.connect(unauthorized).unpause()).to.be.reverted;
    });

    it("Should enforce ADMIN_ROLE for canonical chain update", async () => {
      await expect(
        attestation.connect(attester).updateCanonicalChainId(8453)
      ).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────
  // 9. Pausability
  // ──────────────────────────────────────────────
  describe("Pausability", () => {
    beforeEach(async () => {
      await registerCharity(charity1.address);
    });

    it("Should pause and unpause", async () => {
      await attestation.pause();
      expect(await attestation.paused()).to.equal(true);

      await attestation.unpause();
      expect(await attestation.paused()).to.equal(false);
    });

    it("Should block attestations when paused", async () => {
      await attestation.pause();
      await expect(
        attestation.connect(attester).attest(charity1.address, 5000, USD, refHash("pause-001"))
      ).to.be.revertedWithCustomError(attestation, "EnforcedPause");
    });

    it("Should block batch attestations when paused", async () => {
      await attestation.pause();
      await expect(
        attestation.connect(attester).batchAttest(
          [charity1.address], [5000], [USD], [refHash("pause-002")]
        )
      ).to.be.revertedWithCustomError(attestation, "EnforcedPause");
    });

    it("Should block reversals when paused", async () => {
      const hash = await attestDonation(charity1.address, 5000, USD, refHash("pause-003"));
      await attestation.pause();
      await expect(
        attestation.connect(attester).reverseAttestation(hash)
      ).to.be.revertedWithCustomError(attestation, "EnforcedPause");
    });

    it("Should block batch reversals when paused", async () => {
      const hash = await attestDonation(charity1.address, 5000, USD, refHash("pause-004"));
      await attestation.pause();
      await expect(
        attestation.connect(attester).batchReverseAttestations([hash])
      ).to.be.revertedWithCustomError(attestation, "EnforcedPause");
    });

    it("Should allow view functions when paused", async () => {
      const hash = await attestDonation(charity1.address, 5000, USD, refHash("pause-005"));
      await attestation.pause();

      // All view functions should work
      await attestation.getAttestation(hash);
      await attestation.getTotalAttested(charity1.address, USD);
      await attestation.getAttestationCount();
      await attestation.isRefHashProcessed(refHash("pause-005"));
      await attestation.getCharityInfo(charity1.address);
    });
  });

  // ──────────────────────────────────────────────
  // 10. View Functions
  // ──────────────────────────────────────────────
  describe("View Functions", () => {
    beforeEach(async () => {
      await registerCharity(charity1.address);
      await registerCharity(charity2.address);
    });

    it("Should return attestation by hash", async () => {
      const hash = await attestDonation(charity1.address, 5000, USD, refHash("view-001"));
      const record = await attestation.getAttestation(hash);
      expect(record.charity).to.equal(charity1.address);
      expect(record.amountInCents).to.equal(5000);
    });

    it("Should return empty attestation for unknown hash", async () => {
      const record = await attestation.getAttestation(refHash("nonexistent"));
      expect(record.attestedAt).to.equal(0);
    });

    it("Should return total attested per charity per currency", async () => {
      await attestDonation(charity1.address, 5000, USD, refHash("view-002"));
      await attestDonation(charity1.address, 3000, CAD, refHash("view-003"));
      await attestDonation(charity2.address, 2000, USD, refHash("view-004"));

      expect(await attestation.getTotalAttested(charity1.address, USD)).to.equal(5000);
      expect(await attestation.getTotalAttested(charity1.address, CAD)).to.equal(3000);
      expect(await attestation.getTotalAttested(charity2.address, USD)).to.equal(2000);
      expect(await attestation.getTotalAttested(charity2.address, CAD)).to.equal(0);
    });

    it("Should return attestation count", async () => {
      await attestDonation(charity1.address, 5000, USD, refHash("view-005"));
      await attestDonation(charity2.address, 3000, USD, refHash("view-006"));
      expect(await attestation.getAttestationCount()).to.equal(2);
    });

    it("Should return ref hash processed status", async () => {
      const ref = refHash("view-007");
      expect(await attestation.isRefHashProcessed(ref)).to.equal(false);
      await attestDonation(charity1.address, 5000, USD, ref);
      expect(await attestation.isRefHashProcessed(ref)).to.equal(true);
    });

    it("Should return charity info", async () => {
      const [isRegistered, isActive] = await attestation.getCharityInfo(charity1.address);
      expect(isRegistered).to.equal(true);
      expect(isActive).to.equal(true);

      const [isReg2, isAct2] = await attestation.getCharityInfo(unauthorized.address);
      expect(isReg2).to.equal(false);
      expect(isAct2).to.equal(false);
    });
  });

  // ──────────────────────────────────────────────
  // 11. Upgradeability
  // ──────────────────────────────────────────────
  describe("Upgradeability", () => {
    it("Should not allow initialize to be called twice", async () => {
      await expect(
        attestation.initialize(HARDHAT_CHAIN_ID, admin.address),
      ).to.be.revertedWithCustomError(attestation, "InvalidInitialization");
    });

    it("Should allow DEFAULT_ADMIN_ROLE to upgrade", async () => {
      const V2 = await ethers.getContractFactory("FiatDonationAttestation");
      const upgraded = await hre.upgrades.upgradeProxy(
        await attestation.getAddress(),
        V2,
        { kind: "uups" },
      );
      expect(await upgraded.getAddress()).to.equal(await attestation.getAddress());
    });

    it("Should reject unauthorized upgrade", async () => {
      const V2 = await ethers.getContractFactory("FiatDonationAttestation", unauthorized);
      await expect(
        hre.upgrades.upgradeProxy(await attestation.getAddress(), V2, { kind: "uups" }),
      ).to.be.reverted;
    });

    it("Should preserve state across upgrade", async () => {
      // Write state
      await registerCharity(charity1.address);
      const hash = await attestDonation(charity1.address, 5000, USD, refHash("upg-001"));

      // Upgrade
      const V2 = await ethers.getContractFactory("FiatDonationAttestation");
      const upgraded = await hre.upgrades.upgradeProxy(
        await attestation.getAddress(),
        V2,
        { kind: "uups" },
      );

      // Verify state preserved
      const [isRegistered, isActive] = await upgraded.getCharityInfo(charity1.address);
      expect(isRegistered).to.equal(true);
      expect(isActive).to.equal(true);
      expect(await upgraded.getAttestationCount()).to.equal(1);
      expect(await upgraded.getTotalAttested(charity1.address, USD)).to.equal(5000);
      expect(await upgraded.canonicalChainId()).to.equal(HARDHAT_CHAIN_ID);

      const record = await upgraded.getAttestation(hash);
      expect(record.amountInCents).to.equal(5000);
    });

    it("Should keep same proxy address after upgrade", async () => {
      const proxyAddr = await attestation.getAddress();
      const V2 = await ethers.getContractFactory("FiatDonationAttestation");
      const upgraded = await hre.upgrades.upgradeProxy(proxyAddr, V2, { kind: "uups" });
      expect(await upgraded.getAddress()).to.equal(proxyAddr);
    });
  });

  // ──────────────────────────────────────────────
  // 12. Privacy
  // ──────────────────────────────────────────────
  describe("Privacy", () => {
    it("Should not include any donor address in AttestationRecorded event", async () => {
      await registerCharity(charity1.address);
      const ref = refHash("priv-001");
      const tx = await attestation.connect(attester).attest(charity1.address, 5000, USD, ref);
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try {
          return attestation.interface.parseLog(log)?.name === "AttestationRecorded";
        } catch { return false; }
      });
      const parsed = attestation.interface.parseLog(event);

      // Event args should only contain: attestationHash, charity, amountInCents,
      // currencyCode, timestamp, offChainRefHash, status — NO donor address
      const argNames = parsed.fragment.inputs.map(i => i.name);
      expect(argNames).to.not.include("donor");
      expect(argNames).to.not.include("sender");
      expect(argNames).to.not.include("from");
    });

    it("Should not store any donor address in attestation struct", async () => {
      await registerCharity(charity1.address);
      const hash = await attestDonation(charity1.address, 5000, USD, refHash("priv-002"));

      const record = await attestation.getAttestation(hash);
      // The struct fields: attestationHash, charity, amountInCents,
      // currencyCode, attestedAt, offChainRefHash, status
      // charity is the receiving org, NOT the donor
      // Verify no field matches the attester (bridge wallet) address
      expect(record.charity).to.not.equal(attester.address);
    });

    it("Should not expose donor info through any function return", async () => {
      await registerCharity(charity1.address);
      const hash = await attestDonation(charity1.address, 5000, USD, refHash("priv-003"));

      // Verify getAttestation return has exactly 7 struct fields
      // and none of them are donor-related
      const record = await attestation.getAttestation(hash);
      const fields = record.toObject();
      const fieldNames = Object.keys(fields);
      expect(fieldNames).to.have.lengthOf(7);
      expect(fieldNames).to.not.include("donor");
      expect(fieldNames).to.not.include("sender");
      expect(fieldNames).to.not.include("from");
      expect(fieldNames).to.not.include("user");
    });
  });
});
