require("hardhat/config");
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("dotenv").config();

const config = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 1287, // Match Moonbase Alpha for local testing
      mining: {
        auto: true,
        interval: 5000
      }
    },
    moonbase: {
      url: process.env.MOONBEAM_API_KEY 
        ? `https://moonbase-alpha.api.onfinality.io/public/${process.env.MOONBEAM_API_KEY}`
        : "https://rpc.api.moonbase.moonbeam.network",
      chainId: 1287, // Moonbase Alpha TestNet
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gas: 5000000,
      gasPrice: 1000000000
    },
    moonbeam: {
      url: process.env.MOONBEAM_API_KEY 
        ? `https://moonbeam.api.onfinality.io/public/${process.env.MOONBEAM_API_KEY}`
        : "https://rpc.api.moonbeam.network",
      chainId: 1284, // Moonbeam Mainnet
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true
  },
  etherscan: {
    apiKey: {
      moonbaseAlpha: process.env.MOONSCAN_API_KEY || "",
      moonbeam: process.env.MOONSCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "moonbaseAlpha",
        chainId: 1287,
        urls: {
          apiURL: "https://api-moonbase.moonscan.io/api",
          browserURL: "https://moonbase.moonscan.io/"
        }
      },
      {
        network: "moonbeam",
        chainId: 1284,
        urls: {
          apiURL: "https://api-moonbeam.moonscan.io/api",
          browserURL: "https://moonscan.io/"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};

module.exports = config;