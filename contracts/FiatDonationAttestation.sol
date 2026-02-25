// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title FiatDonationAttestation
 * @dev Records fiat donations on-chain as anonymous attestations for transparency and audit.
 *      No PII is stored on-chain — GDPR/CCPA compliant by design.
 *
 * Storage Layout (contract state variables, sequential from slot 0):
 * | Slot  | Variable               | Type                                              |
 * |-------|------------------------|---------------------------------------------------|
 * | 0     | attestations           | mapping(bytes32 => FiatAttestation)                |
 * | 1     | processedRefHashes     | mapping(bytes32 => bool)                           |
 * | 2     | charities              | mapping(address => Charity)                        |
 * | 3     | totalAttestedByCharity | mapping(address => mapping(bytes3 => uint256))     |
 * | 4     | attestationCount       | uint256                                            |
 * | 5     | canonicalChainId       | uint256                                            |
 * | 6-55  | __gap                  | uint256[50]                                        |
 */
contract FiatDonationAttestation is Initializable, AccessControlUpgradeable, PausableUpgradeable, UUPSUpgradeable {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");

    uint256 public constant MAX_BATCH_SIZE = 50;

    enum AttestationStatus { Pending, Confirmed, Reversed }

    struct FiatAttestation {
        bytes32 attestationHash;
        address charity;
        uint256 amountInCents;
        bytes3 currencyCode;
        uint256 attestedAt;
        bytes32 offChainRefHash;
        AttestationStatus status;
    }

    struct Charity {
        bool isRegistered;
        bool isActive;
    }

    // Storage slot 0
    mapping(bytes32 => FiatAttestation) public attestations;
    // Storage slot 1
    mapping(bytes32 => bool) public processedRefHashes;
    // Storage slot 2
    mapping(address => Charity) public charities;
    // Storage slot 3
    mapping(address => mapping(bytes3 => uint256)) public totalAttestedByCharity;
    // Storage slot 4
    uint256 public attestationCount;
    // Storage slot 5
    uint256 public canonicalChainId;

    // Storage gap for future upgrades
    uint256[50] private __gap;

    // Events
    event AttestationRecorded(
        bytes32 indexed attestationHash,
        address indexed charity,
        uint256 amountInCents,
        bytes3 currencyCode,
        uint256 timestamp,
        bytes32 offChainRefHash,
        AttestationStatus status
    );
    event AttestationStatusUpdated(
        bytes32 indexed attestationHash,
        AttestationStatus oldStatus,
        AttestationStatus newStatus
    );
    event AttestationReversed(
        bytes32 indexed originalHash,
        uint256 reversedAmountInCents
    );
    event BatchAttestationRecorded(uint256 count, uint256 totalAmountInCents, bytes3 currencyCode);
    event CharityRegistered(address indexed charity, uint256 timestamp);
    event CharityStatusUpdated(address indexed charity, bool isActive);
    event CanonicalChainUpdated(uint256 oldChainId, uint256 newChainId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(uint256 canonicalChainId_, address admin) public initializer {
        require(admin != address(0), "Invalid admin address");
        require(canonicalChainId_ != 0, "Invalid canonical chain ID");

        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        canonicalChainId = canonicalChainId_;
    }

    // ──────────────────────────────────────────────
    // Charity Management (ADMIN_ROLE)
    // ──────────────────────────────────────────────

    function registerCharity(address charity) external onlyRole(ADMIN_ROLE) {
        require(charity != address(0), "Invalid charity address");
        require(!charities[charity].isRegistered, "Charity already registered");

        charities[charity] = Charity({
            isRegistered: true,
            isActive: true
        });

        emit CharityRegistered(charity, block.timestamp);
    }

    function updateCharityStatus(address charity, bool isActive) external onlyRole(ADMIN_ROLE) {
        require(charities[charity].isRegistered, "Charity not registered");

        charities[charity].isActive = isActive;
        emit CharityStatusUpdated(charity, isActive);
    }

    // ──────────────────────────────────────────────
    // Attestation (ATTESTER_ROLE)
    // ──────────────────────────────────────────────

    function attest(
        address charity,
        uint256 amountInCents,
        bytes3 currencyCode,
        bytes32 offChainRefHash
    ) external onlyRole(ATTESTER_ROLE) whenNotPaused returns (bytes32) {
        return _attest(charity, amountInCents, currencyCode, offChainRefHash);
    }

    function batchAttest(
        address[] calldata _charities,
        uint256[] calldata amounts,
        bytes3[] calldata currencies,
        bytes32[] calldata refHashes
    ) external onlyRole(ATTESTER_ROLE) whenNotPaused returns (bytes32[] memory) {
        uint256 len = _charities.length;
        require(len == amounts.length, "Array length mismatch");
        require(len == currencies.length, "Array length mismatch");
        require(len == refHashes.length, "Array length mismatch");
        require(len > 0 && len <= MAX_BATCH_SIZE, "Invalid batch size");

        bytes32[] memory hashes = new bytes32[](len);

        // Track totals per currency for batch event
        // Use first currency as representative for batch event
        uint256 batchTotal = 0;
        bytes3 batchCurrency = currencies[0];

        for (uint256 i = 0; i < len; i++) {
            hashes[i] = _attest(_charities[i], amounts[i], currencies[i], refHashes[i]);
            if (currencies[i] == batchCurrency) {
                batchTotal += amounts[i];
            }
        }

        emit BatchAttestationRecorded(len, batchTotal, batchCurrency);

        return hashes;
    }

    function _attest(
        address charity,
        uint256 amountInCents,
        bytes3 currencyCode,
        bytes32 offChainRefHash
    ) internal returns (bytes32) {
        require(block.chainid == canonicalChainId, "Attestations disabled on non-canonical chain");
        require(charities[charity].isRegistered, "Charity not registered");
        require(charities[charity].isActive, "Charity not active");
        require(amountInCents > 0, "Amount must be greater than zero");
        require(currencyCode != bytes3(0), "Invalid currency code");
        require(offChainRefHash != bytes32(0), "Invalid reference hash");
        require(!processedRefHashes[offChainRefHash], "Reference already processed");

        bytes32 attestationHash = keccak256(
            abi.encodePacked(charity, amountInCents, currencyCode, block.timestamp, offChainRefHash)
        );

        attestations[attestationHash] = FiatAttestation({
            attestationHash: attestationHash,
            charity: charity,
            amountInCents: amountInCents,
            currencyCode: currencyCode,
            attestedAt: block.timestamp,
            offChainRefHash: offChainRefHash,
            status: AttestationStatus.Pending
        });

        processedRefHashes[offChainRefHash] = true;
        totalAttestedByCharity[charity][currencyCode] += amountInCents;
        attestationCount++;

        emit AttestationRecorded(
            attestationHash,
            charity,
            amountInCents,
            currencyCode,
            block.timestamp,
            offChainRefHash,
            AttestationStatus.Pending
        );

        return attestationHash;
    }

    // ──────────────────────────────────────────────
    // Reversal (ATTESTER_ROLE)
    // ──────────────────────────────────────────────

    function reverseAttestation(bytes32 attestationHash) external onlyRole(ATTESTER_ROLE) whenNotPaused {
        _reverseAttestation(attestationHash);
    }

    function batchReverseAttestations(bytes32[] calldata hashes) external onlyRole(ATTESTER_ROLE) whenNotPaused {
        require(hashes.length > 0 && hashes.length <= MAX_BATCH_SIZE, "Invalid batch size");

        for (uint256 i = 0; i < hashes.length; i++) {
            _reverseAttestation(hashes[i]);
        }
    }

    function _reverseAttestation(bytes32 attestationHash) internal {
        FiatAttestation storage a = attestations[attestationHash];
        require(a.attestedAt != 0, "Attestation not found");
        require(a.status != AttestationStatus.Reversed, "Already reversed");

        AttestationStatus oldStatus = a.status;
        a.status = AttestationStatus.Reversed;
        totalAttestedByCharity[a.charity][a.currencyCode] -= a.amountInCents;

        emit AttestationStatusUpdated(attestationHash, oldStatus, AttestationStatus.Reversed);
        emit AttestationReversed(attestationHash, a.amountInCents);
    }

    // ──────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────

    function updateCanonicalChainId(uint256 newChainId) external onlyRole(ADMIN_ROLE) {
        require(newChainId != 0, "Invalid chain ID");
        uint256 oldChainId = canonicalChainId;
        canonicalChainId = newChainId;
        emit CanonicalChainUpdated(oldChainId, newChainId);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    function getAttestation(bytes32 hash) external view returns (FiatAttestation memory) {
        return attestations[hash];
    }

    function getTotalAttested(address charity, bytes3 currencyCode) external view returns (uint256) {
        return totalAttestedByCharity[charity][currencyCode];
    }

    function getAttestationCount() external view returns (uint256) {
        return attestationCount;
    }

    function isRefHashProcessed(bytes32 refHash) external view returns (bool) {
        return processedRefHashes[refHash];
    }

    function getCharityInfo(address charity) external view returns (bool isRegistered, bool isActive) {
        Charity storage c = charities[charity];
        return (c.isRegistered, c.isActive);
    }

    // ──────────────────────────────────────────────
    // Upgrade Authorization
    // ──────────────────────────────────────────────

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
