// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./CharityScheduledDistribution.sol";

/**
 * @title DistributionExecutor
 * @dev Automates the execution of distributions
 */
contract DistributionExecutor {
    CharityScheduledDistribution public immutable distribution;
    
    constructor(address distributionAddress) {
        distribution = CharityScheduledDistribution(distributionAddress);
    }
    
    /**
     * @dev Execute distributions for the given block of schedule IDs
     * @param startId Start schedule ID
     * @param endId End schedule ID (inclusive)
     */
    function executeDistributionBatch(uint256 startId, uint256 endId) external {
        require(endId >= startId, "Invalid range");
        require(endId - startId < 100, "Range too large");
        
        uint256[] memory scheduleIds = new uint256[](endId - startId + 1);
        
        for (uint256 i = 0; i < scheduleIds.length; i++) {
            scheduleIds[i] = startId + i;
        }
        
        distribution.executeDistributions(scheduleIds);
    }
}