const fs = require('fs');

import Web3 from 'web3';
import axios from 'axios';
import { NFA_CONTRACT_ADDRESS, WEB3_PROVIDER, BSCSCAN_API_KEY } from '../config/constants';
import { AIRDROP_EXEMPTED_ADDRESSES, NFA_STAKING_POOLS } from './data/airdropExemptions';
import { transpose } from '../helpers/csvTransposer';

const converter = require('json-2-csv');
const nonFungibleApesAbi = require('../abi/nonfungibleapes.json');
const nfaStakingPoolAbi = require('../abi/nfaStakingPool.json');
const apeData: any = require('./data/finalApeData.json');

const web3 = new Web3(new Web3.providers.HttpProvider(WEB3_PROVIDER));
const nonFungibleApesContract = new web3.eth.Contract(nonFungibleApesAbi, NFA_CONTRACT_ADDRESS);

const apiUrl = 'https://api.bscscan.com/api';

const lowercaseList = (list: string[]) => {
    const lowercased = list.map(address => address.toLowerCase());

    return lowercased;
}

const getAddressFromIndex = async (index: number) => {
    const result = await nonFungibleApesContract.methods.ownerOf(index).call().then((data: any) => {return data});
    return result;
};

const getNfaStakingTransactions = async (stakingContract: string) => {
    const transactionReturnObject = await axios.get(
        `${apiUrl}?module=account&action=txlist&address=${stakingContract}&startblock=10909779&endblock=20028963&sort=asc&apikey=${BSCSCAN_API_KEY}`
    );
    const transactions = transactionReturnObject.data.result;
    console.log(`Transactions Found: ${transactions.length}`);
    if (transactions.length > 9990) {
        throw 'fuck, too many txs';
    }
    const addresses = await extractStakingAddresses(transactions);
    return addresses;
}

const extractStakingAddresses = async (transactions: any[]) => {
    let addresses: any[] = [];
    transactions.map(transaction => {
        let address = transaction.from;
        if(!addresses.includes(address)) {
            addresses.push(address)
        };
    });

    console.log(`Unique Addresses: ${addresses.length}`);
    return addresses;
}

const getNfaStakingContractTier = async (stakingContractAddress: string) => {
    const nfaStakingPool = new web3.eth.Contract(nfaStakingPoolAbi, stakingContractAddress);
    const tier = await nfaStakingPool.methods.TIER().call().then((data: any) => {return data});

    return tier;
}

const calculateRewardsForStakers = async (stakingContractAddress: string) => {
    const confirmedStakers = [];

    // Get the contract and tier of the staking contract
    const nfaStakingPool = new web3.eth.Contract(nfaStakingPoolAbi, stakingContractAddress);
    
    // Get all the potential addresses we need to checky checky
    const potentialStakers = await getNfaStakingTransactions(stakingContractAddress);

    // Filter out potential vs confirmed stakers
    for (let i = 0; i < potentialStakers.length; i++) {
        let address = potentialStakers[i];
        const nfaStakedCount = await nfaStakingPool.methods.stakedNfts(address).call().then(
            (data: any) => {return data.length}
        )

        confirmedStakers.push({ address, nfaStakedCount });
    }

    return confirmedStakers;
}

const calculateAirdropRewards = async (tokenValues: number[], decimals: number, name: string) => {
    let payments: any = {};
    let tierAmounts: any = {};

    const nfaIndexes = Array.from(Array(1000).keys());
    const lowercaseExemptedAddresses = lowercaseList(AIRDROP_EXEMPTED_ADDRESSES);

    console.log('Starting the script, checking all staked NFAs.');
    // Check all NFAs in general and add to payments
    for (let i = 0; i < nfaIndexes.length; i++) {
        const index = nfaIndexes[i];
        const address = await getAddressFromIndex(index) as string;
        const rarityTier = apeData[index].attributes.rarityTierNumber as number;

        // Check that the address doesn't exist already and isn't exempted from the airdrop.
        if (!payments[address]) {
            payments[address] = 0;
        };

        if (!tierAmounts[rarityTier]) {
            tierAmounts[rarityTier] = 0;
        };

        tierAmounts[rarityTier] += 1;

        // Add the amount of tokens owed
        payments[address] += (tokenValues[rarityTier - 1] * 10**decimals);
    };

    console.log('Finished with initial check.')

    // Check all NFAs in staking pools
    for (let i = 0; i < NFA_STAKING_POOLS.length; i++) {
        // Get initial information for a single staking pool
        const poolAddress = NFA_STAKING_POOLS[i];
        const poolTier = await getNfaStakingContractTier(poolAddress);
        console.log(`Checking out pool with tier ${poolTier}.`);

        const stakerRewards = await calculateRewardsForStakers(poolAddress);

        // Add payments owed in that staking pool
        for (let j = 0; j < stakerRewards.length; j++) {
            const { address, nfaStakedCount } = stakerRewards[j];

            if (!payments[address]) {
                payments[address] = 0;
            };
    
            if (!tierAmounts[poolTier]) {
                tierAmounts[poolTier] = 0;
            };
    
            tierAmounts[poolTier] += 1;
    
            // Add the amount of tokens owed
            payments[address] += ((tokenValues[poolTier - 1] * 10**decimals) * nfaStakedCount);
        }
    }

    console.log(tierAmounts);

    const balances = Object.keys(payments).map(address => {
        if (!lowercaseExemptedAddresses.includes(address.toLowerCase()) && payments[address] != 0) {
            return { address, value: payments[address].toLocaleString('fullwide', {useGrouping:false}) }
        }
    }).filter(object => object?.address);

    converter.json2csv(balances, (err: any, csv: any) => {
        if (err) { throw err; }
        fs.writeFile(`./data/airdrops/${name}-RAW.csv`, csv, 'utf8', () => {
            if (err) {
              console.log('Some error occured - file either not saved or corrupted file saved.');
            } else {
              transpose(`./data/airdrops/${name}-RAW.csv`, `./data/airdrops/${name}.csv`)
              console.log('WE SAVED THE MOTHER FUCKING CSV BABAY');
            }
        });
    });
}


// Uncomment this & input variables, then npm run nfa-airdrop to run the script
//calculateAirdropRewards([1, 2, 3, 4, 5], 18, "FILENAME");