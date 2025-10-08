# Give Protocol - Smart Contracts

Smart contracts for Give Protocol, a blockchain-based charitable giving platform built on Moonbeam Network.

## Contracts

- **DurationDonation.sol** - Main donation contract for direct giving
- **PortfolioFunds.sol** - Portfolio management for charitable endowment and impact funds
- **CharityScheduledDistribution.sol** - Automated scheduled distributions to charities
- **DistributionExecutor.sol** - Executor contract for managing distributions
- **VolunteerVerification.sol** - Volunteer verification and management

## Setup

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```
MOONBASE_RPC_URL=
PRIVATE_KEY=
MOONSCAN_API_KEY=
```

## Development

```bash
# Compile contracts
npm run compile

# Run tests
npm run test

# Check coverage
npm run test:coverage

# Lint contracts
npm run lint:sol
```

## Deployment

```bash
# Deploy to Moonbase Alpha testnet
npm run deploy:moonbase
```

## Security

- All contracts use OpenZeppelin libraries
- Fuzzing tests available via Scribble
- See SECURITY.md for security policies

## License

UNLICENSED - Private Repository
