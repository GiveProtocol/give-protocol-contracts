// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title CharityScheduledDistribution
 * @dev Allows donors to schedule token distributions to charities on a monthly basis
 */
contract CharityScheduledDistribution is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    
    // Struct to track donation schedules
    struct DonationSchedule {
        address donor;
        address charity;
        address token;
        uint256 totalAmount;
        uint256 amountPerMonth;
        uint256 monthsRemaining;
        uint256 nextDistributionTimestamp;
        bool active;
    }
    
    // Mapping of scheduleId to DonationSchedule
    mapping(uint256 => DonationSchedule) public donationSchedules;
    
    // Counter for schedule IDs
    uint256 public nextScheduleId;
    
    // Mapping for token prices (simplified version without Chainlink)
    mapping(address => uint256) public tokenPrices;
    
    // Verified charities
    mapping(address => bool) public verifiedCharities;
    
    // Distribution interval (30 days in seconds)
    uint256 public constant DISTRIBUTION_INTERVAL = 30 days;
    
    // Minimum token value in USD (42 USD with 8 decimals for compatibility)
    uint256 public constant MIN_TOKEN_VALUE_USD = 42 * 10**8;
    
    // Events
    event CharityAdded(address indexed charity);
    event CharityRemoved(address indexed charity);
    event TokenPriceSet(address indexed token, uint256 price);
    event ScheduleCreated(
        uint256 indexed scheduleId, 
        address indexed donor, 
        address indexed charity, 
        address token,
        uint256 totalAmount, 
        uint256 amountPerMonth, 
        uint256 months
    );
    event DistributionExecuted(
        uint256 indexed scheduleId, 
        address indexed charity, 
        address token,
        uint256 amount, 
        uint256 monthsRemaining
    );
    event ScheduleCancelled(uint256 indexed scheduleId);
    
    /**
     * @dev Constructor
     */
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Add a verified charity
     * @param charity The charity address to add
     */
    function addCharity(address charity) external onlyOwner {
        require(charity != address(0), "Invalid charity address");
        verifiedCharities[charity] = true;
        emit CharityAdded(charity);
    }
    
    /**
     * @dev Remove a verified charity
     * @param charity The charity address to remove
     */
    function removeCharity(address charity) external onlyOwner {
        verifiedCharities[charity] = false;
        emit CharityRemoved(charity);
    }
    
    /**
     * @dev Set price for a token (simplified version without Chainlink)
     * @param token The token address
     * @param price The token price in USD (8 decimals)
     */
    function setTokenPrice(address token, uint256 price) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(price > 0, "Price must be > 0");
        tokenPrices[token] = price;
        emit TokenPriceSet(token, price);
    }
    
    /**
     * @dev Get token price in USD
     * @param token The token address
     * @return price The token price in USD (8 decimals)
     */
    function getTokenPrice(address token) public view returns (uint256) {
        uint256 price = tokenPrices[token];
        require(price > 0, "Price not set");
        return price;
    }
    
    /**
     * @dev Create a new monthly distribution schedule
     * @param charity The charity address
     * @param token The token address
     * @param totalAmount The total amount to distribute
     */
    function createSchedule(
        address charity, 
        address token, 
        uint256 totalAmount
    ) external nonReentrant whenNotPaused {
        require(verifiedCharities[charity], "Charity not verified");
        require(tokenPrices[token] > 0, "Token not supported");
        require(totalAmount > 0, "Amount must be > 0");
        
        // Verify token price is > 42 USD
        uint256 tokenPrice = getTokenPrice(token);
        require(tokenPrice >= MIN_TOKEN_VALUE_USD, "Token value below minimum");
        
        // Calculate monthly distribution (totalAmount / 12)
        uint256 amountPerMonth = totalAmount / 12;
        require(amountPerMonth > 0, "Monthly amount too small");
        
        // Transfer tokens from donor to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);
        
        // Create schedule
        uint256 scheduleId = nextScheduleId++;
        donationSchedules[scheduleId] = DonationSchedule({
            donor: msg.sender,
            charity: charity,
            token: token,
            totalAmount: totalAmount,
            amountPerMonth: amountPerMonth,
            monthsRemaining: 12,
            nextDistributionTimestamp: block.timestamp + DISTRIBUTION_INTERVAL,
            active: true
        });
        
        emit ScheduleCreated(
            scheduleId, 
            msg.sender, 
            charity, 
            token,
            totalAmount, 
            amountPerMonth, 
            12
        );
    }
    
    /**
     * @dev Execute distributions that are due
     * @param scheduleIds Array of schedule IDs to process
     */
    function executeDistributions(uint256[] calldata scheduleIds) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < scheduleIds.length; i++) {
            uint256 scheduleId = scheduleIds[i];
            DonationSchedule storage schedule = donationSchedules[scheduleId];
            
            if (
                schedule.active && 
                schedule.monthsRemaining > 0 && 
                block.timestamp >= schedule.nextDistributionTimestamp
            ) {
                // Transfer monthly amount to charity
                IERC20(schedule.token).safeTransfer(schedule.charity, schedule.amountPerMonth);
                
                // Update schedule
                schedule.monthsRemaining--;
                schedule.nextDistributionTimestamp += DISTRIBUTION_INTERVAL;
                
                // If all months distributed, mark schedule as inactive
                if (schedule.monthsRemaining == 0) {
                    schedule.active = false;
                }
                
                emit DistributionExecuted(
                    scheduleId, 
                    schedule.charity, 
                    schedule.token,
                    schedule.amountPerMonth, 
                    schedule.monthsRemaining
                );
            }
        }
    }
    
    /**
     * @dev Cancel a schedule (only by donor)
     * @param scheduleId The schedule ID to cancel
     */
    function cancelSchedule(uint256 scheduleId) external nonReentrant whenNotPaused {
        DonationSchedule storage schedule = donationSchedules[scheduleId];
        
        require(schedule.donor == msg.sender, "Not the donor");
        require(schedule.active, "Schedule not active");
        
        // Calculate remaining amount
        uint256 remainingAmount = schedule.amountPerMonth * schedule.monthsRemaining;
        
        // Mark schedule as inactive BEFORE external call (check-effects-interactions pattern)
        schedule.active = false;
        schedule.monthsRemaining = 0;
        
        // Transfer remaining tokens back to donor
        IERC20(schedule.token).safeTransfer(schedule.donor, remainingAmount);
        
        emit ScheduleCancelled(scheduleId);
    }
    
    /**
     * @dev Get all active schedules for a donor
     * @param donor The donor address
     * @return scheduleIds Array of schedule IDs
     */
    function getDonorSchedules(address donor) external view returns (uint256[] memory) {
        uint256 count = 0;
        
        // Count schedules
        for (uint256 i = 1; i < nextScheduleId; i++) {
            if (donationSchedules[i].donor == donor && donationSchedules[i].active) {
                count++;
            }
        }
        
        // Populate result
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        
        for (uint256 i = 1; i < nextScheduleId; i++) {
            if (donationSchedules[i].donor == donor && donationSchedules[i].active) {
                result[index] = i;
                index++;
            }
        }
        
        return result;
    }

    /**
     * @dev Pause the contract
     * Only owner can call this function
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the contract
     * Only owner can call this function
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}