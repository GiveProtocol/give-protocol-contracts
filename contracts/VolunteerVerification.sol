// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title VolunteerVerification
 * @dev A contract for verifying volunteer applications and hours on the blockchain
 */
contract VolunteerVerification is Ownable, ReentrancyGuard, Pausable {
    using Address for address payable;

    // Structs
    struct Charity {
        bool isRegistered;
        address payable walletAddress;
        bool isActive;
    }

    struct VolunteerApplication {
        bytes32 applicationHash;
        address applicant;
        address charity;
        uint256 timestamp;
        bool isVerified;
    }

    struct VolunteerHours {
        bytes32 hoursHash;
        address volunteer;
        address charity;
        uint256 hoursWorked;
        uint256 timestamp;
        bool isVerified;
    }

    // Mappings
    mapping(address => Charity) public charities;
    mapping(bytes32 => VolunteerApplication) public applications;
    mapping(bytes32 => VolunteerHours) public volunteerHours;
    
    // Events
    event CharityRegistered(address indexed charity, uint256 timestamp);
    event CharityStatusUpdated(address indexed charity, bool isActive);
    event ApplicationVerified(
        bytes32 indexed applicationHash,
        address indexed applicant,
        address indexed charity,
        uint256 timestamp
    );
    event HoursVerified(
        bytes32 indexed hoursHash,
        address indexed volunteer,
        address indexed charity,
        uint256 hoursWorked,
        uint256 timestamp
    );
    
    // Errors
    error CharityNotRegistered(address charity);
    error CharityNotActive(address charity);
    error HashAlreadyVerified(bytes32 hash);
    error InvalidHash();
    error Unauthorized(address sender);

    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Register a new charity
     * @param charityAddress The address of the charity to register
     */
    function registerCharity(address payable charityAddress) external onlyOwner {
        require(charityAddress != address(0), "Invalid charity address");
        require(!charities[charityAddress].isRegistered, "Charity already registered");
        
        charities[charityAddress] = Charity({
            isRegistered: true,
            walletAddress: charityAddress,
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
     * @dev Verify a volunteer application
     * @param applicationHash The hash of the application to verify
     * @param applicant The address of the applicant
     */
    function verifyApplication(bytes32 applicationHash, address applicant) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        if (!charities[msg.sender].isRegistered) {
            revert CharityNotRegistered(msg.sender);
        }
        
        if (!charities[msg.sender].isActive) {
            revert CharityNotActive(msg.sender);
        }
        
        if (applicationHash == bytes32(0)) {
            revert InvalidHash();
        }
        
        if (applications[applicationHash].isVerified) {
            revert HashAlreadyVerified(applicationHash);
        }
        
        applications[applicationHash] = VolunteerApplication({
            applicationHash: applicationHash,
            applicant: applicant,
            charity: msg.sender,
            timestamp: block.timestamp,
            isVerified: true
        });
        
        emit ApplicationVerified(applicationHash, applicant, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Verify volunteer hours
     * @param hoursHash The hash of the hours record
     * @param volunteer The address of the volunteer
     * @param hoursWorked The number of hours worked
     */
    function verifyHours(bytes32 hoursHash, address volunteer, uint256 hoursWorked) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        if (!charities[msg.sender].isRegistered) {
            revert CharityNotRegistered(msg.sender);
        }
        
        if (!charities[msg.sender].isActive) {
            revert CharityNotActive(msg.sender);
        }
        
        if (hoursHash == bytes32(0)) {
            revert InvalidHash();
        }
        
        if (volunteerHours[hoursHash].isVerified) {
            revert HashAlreadyVerified(hoursHash);
        }
        
        volunteerHours[hoursHash] = VolunteerHours({
            hoursHash: hoursHash,
            volunteer: volunteer,
            charity: msg.sender,
            hoursWorked: hoursWorked,
            timestamp: block.timestamp,
            isVerified: true
        });
        
        emit HoursVerified(hoursHash, volunteer, msg.sender, hoursWorked, block.timestamp);
    }
    
    /**
     * @dev Check if an application hash is verified
     * @param applicationHash The hash to check
     * @return isVerified Verification status
     * @return applicant Applicant address
     * @return charity Charity address
     * @return timestamp Timestamp of verification
     */
    function checkApplicationVerification(bytes32 applicationHash) 
        external 
        view 
        returns (bool isVerified, address applicant, address charity, uint256 timestamp) 
    {
        VolunteerApplication storage app = applications[applicationHash];
        return (app.isVerified, app.applicant, app.charity, app.timestamp);
    }
    
    /**
     * @dev Check if hours hash is verified
     * @param hoursHash The hash to check
     * @return isVerified Verification status
     * @return volunteer Volunteer address
     * @return charity Charity address
     * @return hoursWorked Number of hours worked
     * @return timestamp Timestamp of verification
     */
    function checkHoursVerification(bytes32 hoursHash) 
        external 
        view 
        returns (bool isVerified, address volunteer, address charity, uint256 hoursWorked, uint256 timestamp) 
    {
        VolunteerHours storage hoursRecord = volunteerHours[hoursHash];
        return (hoursRecord.isVerified, hoursRecord.volunteer, hoursRecord.charity, hoursRecord.hoursWorked, hoursRecord.timestamp);
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