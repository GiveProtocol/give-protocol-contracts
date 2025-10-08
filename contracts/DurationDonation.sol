// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DurationDonation
 * @dev Enhanced donation contract with integrated platform tip functionality
 * All donations (including platform tips) are tax-deductible
 */
contract DurationDonation is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct Charity {
        bool isRegistered;
        address walletAddress;
        uint256 totalReceived;
        bool isActive;
    }

    struct TaxReceipt {
        address donor;
        address primaryBeneficiary;      // The charity
        uint256 charityAmount;
        uint256 giveProtocolAmount;      // Platform tip
        uint256 totalTaxDeductible;      // Sum of both
        address tokenAddress;
        uint256 timestamp;
        string receiptType;              // "DUAL_BENEFICIARY" or "SINGLE_BENEFICIARY"
    }

    // State variables
    address public giveProtocolTreasury;
    mapping(address => Charity) public charities;
    mapping(address => mapping(address => uint256)) public donations; // donor => charity => amount
    mapping(bytes32 => TaxReceipt) public taxReceipts;
    
    // Pre-set tip percentages (in basis points)
    uint256[] public suggestedTipRates = [500, 1000, 2000]; // 5%, 10%, 20%
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MINIMUM_DONATION = 1e15; // 0.001 tokens minimum
    
    // Events
    event CharityRegistered(address indexed charity, uint256 timestamp);
    event CharityStatusUpdated(address indexed charity, bool isActive);
    event DonationProcessed(
        address indexed donor,
        address indexed charity,
        address token,
        uint256 charityAmount,
        uint256 platformTip,
        uint256 totalTaxDeductible,
        uint256 timestamp,
        bytes32 donationId
    );
    event TaxReceiptGenerated(bytes32 indexed receiptId, address indexed donor);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    
    // Errors
    error CharityNotRegistered(address charity);
    error CharityNotActive(address charity);
    error InvalidAmount(uint256 amount, string reason);
    error InvalidTipOption(uint8 tipOption);
    error TransferFailed(address token, address from, address to, uint256 amount);
    
    constructor(address _giveProtocolTreasury) Ownable(msg.sender) {
        require(_giveProtocolTreasury != address(0), "Invalid treasury address");
        giveProtocolTreasury = _giveProtocolTreasury;
    }
    
    /**
     * @dev Register a new charity
     * @param charityAddress The address of the charity to register
     */
    function registerCharity(address charityAddress) external onlyOwner {
        require(charityAddress != address(0), "Invalid charity address");
        require(!charities[charityAddress].isRegistered, "Charity already registered");
        
        charities[charityAddress] = Charity({
            isRegistered: true,
            walletAddress: charityAddress,
            totalReceived: 0,
            isActive: true
        });
        
        emit CharityRegistered(charityAddress, block.timestamp);
    }

    /**
     * @dev Update charity active status
     * @param charityAddress The address of the charity
     * @param isActive New active status
     */
    function updateCharityStatus(address charityAddress, bool isActive) external onlyOwner {
        if (!charities[charityAddress].isRegistered) {
            revert CharityNotRegistered(charityAddress);
        }
        
        charities[charityAddress].isActive = isActive;
        emit CharityStatusUpdated(charityAddress, isActive);
    }

    /**
     * @dev Update Give Protocol treasury address
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury address");
        address oldTreasury = giveProtocolTreasury;
        giveProtocolTreasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    /**
     * @dev Process donation with integrated optional platform tip
     * @param charity The verified charity receiving the donation
     * @param token The ERC20 token being donated
     * @param charityAmount Amount going to the charity
     * @param platformTip Amount supporting Give Protocol (also tax-deductible)
     */
    function processDonation(
        address charity,
        address token,
        uint256 charityAmount,
        uint256 platformTip
    ) public nonReentrant whenNotPaused {
        if (!charities[charity].isRegistered) {
            revert CharityNotRegistered(charity);
        }
        
        if (!charities[charity].isActive) {
            revert CharityNotActive(charity);
        }
        
        if (charityAmount < MINIMUM_DONATION) {
            revert InvalidAmount(charityAmount, "Donation amount too small");
        }
        
        uint256 totalAmount = charityAmount + platformTip;
        
        // Transfer to charity
        IERC20(token).safeTransferFrom(msg.sender, charity, charityAmount);
        
        // Transfer tip to Give Protocol if provided
        if (platformTip > 0) {
            IERC20(token).safeTransferFrom(msg.sender, giveProtocolTreasury, platformTip);
        }
        
        // Update tracking
        charities[charity].totalReceived += charityAmount;
        donations[msg.sender][charity] += charityAmount;
        
        // Generate donation ID
        bytes32 donationId = keccak256(
            abi.encode(msg.sender, charity, totalAmount, block.timestamp)
        );
        
        // Generate tax receipt
        _generateTaxReceipt(
            donationId,
            msg.sender,
            charity,
            charityAmount,
            platformTip,
            token
        );
        
        // Emit event - ENTIRE amount is tax-deductible
        emit DonationProcessed(
            msg.sender,
            charity,
            token,
            charityAmount,
            platformTip,
            totalAmount,
            block.timestamp,
            donationId
        );
    }
    
    /**
     * @dev Process donation with percentage-based tip
     * @param charity The verified charity
     * @param token The token being donated
     * @param charityAmount Amount for charity
     * @param tipPercentage Tip as basis points (e.g., 500 = 5%)
     */
    function processDonationWithPercentageTip(
        address charity,
        address token,
        uint256 charityAmount,
        uint256 tipPercentage
    ) external {
        uint256 platformTip = (charityAmount * tipPercentage) / BASIS_POINTS;
        processDonation(charity, token, charityAmount, platformTip);
    }

    /**
     * @dev Process donation with suggested tip option
     * @param charity The verified charity
     * @param token The token being donated
     * @param charityAmount Amount for charity
     * @param tipOption 0 = 5%, 1 = 10%, 2 = 20%
     */
    function processDonationWithSuggestedTip(
        address charity,
        address token,
        uint256 charityAmount,
        uint8 tipOption
    ) external {
        if (tipOption >= suggestedTipRates.length) {
            revert InvalidTipOption(tipOption);
        }
        uint256 platformTip = calculateSuggestedTip(charityAmount, tipOption);
        processDonation(charity, token, charityAmount, platformTip);
    }
    
    /**
     * @dev Convenience function to calculate suggested tip amounts
     * @param donationAmount The base donation amount
     * @param tipOption 0 = 5%, 1 = 10%, 2 = 20%
     */
    function calculateSuggestedTip(
        uint256 donationAmount,
        uint8 tipOption
    ) public view returns (uint256) {
        if (tipOption >= suggestedTipRates.length) {
            revert InvalidTipOption(tipOption);
        }
        return (donationAmount * suggestedTipRates[tipOption]) / BASIS_POINTS;
    }

    /**
     * @dev Generate comprehensive tax receipt
     */
    function _generateTaxReceipt(
        bytes32 receiptId,
        address donor,
        address charity,
        uint256 charityAmount,
        uint256 platformTip,
        address token
    ) internal {
        taxReceipts[receiptId] = TaxReceipt({
            donor: donor,
            primaryBeneficiary: charity,
            charityAmount: charityAmount,
            giveProtocolAmount: platformTip,
            totalTaxDeductible: charityAmount + platformTip,
            tokenAddress: token,
            timestamp: block.timestamp,
            receiptType: platformTip > 0 ? "DUAL_BENEFICIARY" : "SINGLE_BENEFICIARY"
        });
        
        emit TaxReceiptGenerated(receiptId, donor);
    }
    
    /**
     * @dev Get charity information
     * @param charityAddress The address of the charity
     */
    function getCharityInfo(address charityAddress) external view returns (
        bool isRegistered,
        address walletAddress,
        uint256 totalReceived,
        bool isActive
    ) {
        Charity storage charity = charities[charityAddress];
        return (
            charity.isRegistered,
            charity.walletAddress,
            charity.totalReceived,
            charity.isActive
        );
    }
    
    /**
     * @dev Get donation amount from donor to charity
     * @param donor The donor address
     * @param charity The charity address
     */
    function getDonationAmount(
        address donor,
        address charity
    ) external view returns (uint256) {
        return donations[donor][charity];
    }

    /**
     * @dev Get all suggested tip rates
     */
    function getSuggestedTipRates() external view returns (uint256[] memory) {
        return suggestedTipRates;
    }

    /**
     * @dev Get tax receipt details
     * @param receiptId The receipt ID
     */
    function getTaxReceipt(bytes32 receiptId) external view returns (
        address donor,
        address primaryBeneficiary,
        uint256 charityAmount,
        uint256 giveProtocolAmount,
        uint256 totalTaxDeductible,
        address tokenAddress,
        uint256 timestamp,
        string memory receiptType
    ) {
        TaxReceipt storage receipt = taxReceipts[receiptId];
        return (
            receipt.donor,
            receipt.primaryBeneficiary,
            receipt.charityAmount,
            receipt.giveProtocolAmount,
            receipt.totalTaxDeductible,
            receipt.tokenAddress,
            receipt.timestamp,
            receipt.receiptType
        );
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}