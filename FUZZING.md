# Diligence Fuzzing Setup

This project is now configured with [ConsenSys Diligence Fuzzing](https://github.com/ConsenSysDiligence/diligence-fuzzing) for smart contract security testing.

## Prerequisites

1. **API Key**: You need to obtain an API key from https://consensys.net/diligence/fuzzing/
2. **Set Environment Variable**:
   ```bash
   export FUZZ_API_KEY=<your_api_key>
   ```

## Available Commands

| Command               | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `npm run fuzz:arm`    | Prepare contracts for fuzzing (instruments the code) |
| `npm run fuzz:run`    | Submit contracts to Diligence Fuzzing API            |
| `npm run fuzz:disarm` | Revert contracts to original state                   |

## Configuration

The fuzzing configuration is stored in `.fuzz.yml` and includes:

- **IDE**: Hardhat
- **Solidity Version**: 0.8.20
- **Target Contracts**:
  - DurationDonation.sol
  - VolunteerVerification.sol
  - CharityScheduledDistribution.sol
  - DistributionExecutor.sol
- **Build Directory**: artifacts
- **Sources Directory**: contracts

## Usage Workflow

1. **Compile contracts first**:

   ```bash
   npm run compile
   ```

2. **Prepare contracts for fuzzing**:

   ```bash
   npm run fuzz:arm
   ```

3. **Run fuzzing campaign**:

   ```bash
   npm run fuzz:run
   ```

4. **Clean up after fuzzing**:
   ```bash
   npm run fuzz:disarm
   ```

## Smart Mode (Optional)

To enable smart mode for enhanced fuzzing:

```bash
export FUZZ_SMART_MODE=1
```

## Security Testing Coverage

The fuzzing setup targets these key contracts:

- **DurationDonation**: Main donation functionality
- **VolunteerVerification**: Volunteer hour verification system
- **CharityScheduledDistribution**: Scheduled distribution management
- **DistributionExecutor**: Distribution execution logic

## Notes

- Make sure contracts are compiled before running fuzzing
- The fuzzing service requires an active internet connection
- Results will be available on the Diligence Fuzzing dashboard
- Always run `fuzz:disarm` to restore original contract files
