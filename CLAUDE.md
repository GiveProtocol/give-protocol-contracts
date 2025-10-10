# CLAUDE.md - Give Protocol Smart Contracts

Give Protocol Smart Contracts - Solidity smart contracts for blockchain-based charitable giving on Moonbeam Network. Part of the Give Protocol distributed repository architecture.

## Repository Structure

This is the **contracts** repository, one of four Give Protocol repositories:
- **give-protocol-webapp**: React/Vite Progressive Web App
- **give-protocol-contracts** (this repo): Solidity smart contracts and Hardhat infrastructure
- **give-protocol-docs**: Jekyll documentation site
- **give-protocol-backend**: Supabase backend and admin functions

## Essential Commands

```bash
npm run compile              # Compile Solidity contracts
npm run test                 # Run Hardhat tests
npm run test:coverage        # Run test coverage report
npm run lint:sol             # Run Solhint on contracts
npm run deploy:moonbase      # Deploy to Moonbase Alpha testnet
npm run fuzz:arm             # Arm fuzzing tests (Scribble)
npm run fuzz:run             # Run fuzzing tests
npm run fuzz:disarm          # Disarm fuzzing tests
```

## Smart Contracts

Core contracts in `/contracts/`:
- **DurationDonation.sol**: Main donation contract
- **CharityScheduledDistribution.sol**: Monthly donation scheduling
- **VolunteerVerification.sol**: Volunteer verification system
- **DistributionExecutor.sol**: Automated distribution execution

## Deployment Scripts

Scripts in `/scripts/`:
- **deploy-moonbase.cjs**: Main deployment script with contract verification
- **deploy-portfolio-funds.cjs**: Deploy portfolio fund contracts
- **create-test-schedules.cjs**: Create test donation schedules

## Environment Setup

`.env` file required:
- `MOONBASE_RPC_URL`: Moonbase Alpha RPC endpoint
- `PRIVATE_KEY`: Deployer wallet private key (never commit!)
- `MOONSCAN_API_KEY`: For contract verification

## Testing

- Unit tests in `/test/` using Hardhat and Chai
- Coverage reports generated in `/coverage/`
- Gas reporting enabled via hardhat-gas-reporter

## Security

- Fuzzing via Scribble (`npm run fuzz:arm` → `npm run fuzz:run`)
- Security scanning via GitHub Actions (Trivy)
- Dependency auditing via npm audit

## Git Workflow

1. Run `npm run compile` to verify contracts compile
2. Run `npm test` before committing
3. Run `npm run lint:sol` to check Solidity style
4. Keep commits focused on single logical changes
