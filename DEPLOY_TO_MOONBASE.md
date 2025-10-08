# Deploying to Moonbase Alpha

## Prerequisites

1. **Get testnet DEV tokens**
   - Visit: https://faucet.moonbeam.network/
   - Enter your wallet address
   - Request DEV tokens (you'll need at least 1 DEV for deployment)

2. **Configure Treasury Address**
   - Edit `scripts/deploy-moonbase.js` line 31
   - Replace `deployer.address` with your Give Protocol treasury address
   - This address will receive platform tips from donations

3. **Set up environment variables**
   Create or update your `.env` file with:
   ```bash
   # Required for deployment
   PRIVATE_KEY=your_wallet_private_key_here
   
   # Optional - for Moonscan verification
   MOONSCAN_API_KEY=your_moonscan_api_key_here
   
   # Optional - if you have an OnFinality API key
   MOONBEAM_API_KEY=your_onfinality_api_key_here
   ```

   ⚠️ **NEVER commit your `.env` file or share your private key!**

## Deployment Steps

1. **Install dependencies** (if not already done)
   ```bash
   npm install
   ```

2. **Compile contracts**
   ```bash
   npm run compile
   ```

3. **Deploy to Moonbase Alpha**
   ```bash
   npx hardhat run scripts/deploy-moonbase.js --network moonbase
   ```

4. **Save the contract addresses**
   The script will output contract addresses like:
   ```
   VITE_TOKEN_CONTRACT_ADDRESS=0x...
   VITE_DONATION_CONTRACT_ADDRESS=0x...
   VITE_VERIFICATION_CONTRACT_ADDRESS=0x...
   VITE_DISTRIBUTION_CONTRACT_ADDRESS=0x...
   ```
   
   Add these to your `.env` file for the frontend to use.

## After Deployment

1. **Update your `.env` file** with the deployed contract addresses
2. **Restart your development server** to pick up the new addresses
3. **Test the contracts** using the Moonbase Alpha network in your wallet

## Viewing Deployed Contracts

You can view your deployed contracts on Moonscan:
- https://moonbase.moonscan.io/address/YOUR_CONTRACT_ADDRESS

## Getting a Moonscan API Key

1. Visit https://moonscan.io/
2. Create an account
3. Go to API Keys section
4. Create a new API key
5. Add it to your `.env` as `MOONSCAN_API_KEY`

## Troubleshooting

- **"Insufficient funds"**: Make sure you have DEV tokens from the faucet
- **"Nonce too low"**: Your account may have pending transactions. Wait a bit or reset your wallet's account
- **Verification fails**: Make sure your Moonscan API key is correct and the contracts have been indexed (wait ~30 seconds after deployment)

## Useful Links

- [Moonbeam Faucet](https://faucet.moonbeam.network/)
- [Moonbase Block Explorer](https://moonbase.moonscan.io/)
- [Moonbeam Docs](https://docs.moonbeam.network/builders/get-started/networks/moonbase/)
- [OnFinality Dashboard](https://app.onfinality.io/) (for API keys)