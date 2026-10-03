import { performance } from 'node:perf_hooks';
import { runRewardsCheck } from '../worker.mjs';

const WALLET = '6iLYbroGEJTvnHzXTxxL1krKKP4HakE4h1mqopxsnjWU';
const KNOWN_REWARD = '3s3DzBLJjG87xUzMxvTRDuXs2opz65xY5YqcjixBCrSU8SBPe6pgF3Gci9m6ezmhA3eZkyXL1B927j2CXrk9ocwQ';
const KNOWN_PURCHASE = '2PXbbPd95GoT6A9oFMBVtuvXewQjJL6eCWFRABLCe71ssiH6gr7FCnN1UXjWkZYF2wS54sSYQ9DLxBNLcJ754Znb';

if (!process.env.HELIUS_API_KEY) {
  console.error('HELIUS_API_KEY is missing. Add it to .dev.vars and run npm run validate:live again.');
  process.exitCode = 1;
} else {
  const startedAt = performance.now();
  const result = await runRewardsCheck(WALLET, process.env.HELIUS_API_KEY);
  const executionTimeMs = Math.round(performance.now() - startedAt);
  const knownReward = result.transactions.find((entry) => entry.signature === KNOWN_REWARD);
  const knownPurchaseCounted = result.transactions.some((entry) => entry.signature === KNOWN_PURCHASE);
  console.log(JSON.stringify({
    wallet: WALLET,
    ansemRewards: result.ansemRewards,
    distributionCount: result.distributionCount,
    mostRecentReward: result.lastReward,
    oldestReward: result.transactions.at(-1) ?? null,
    knownRewardIncluded: knownReward?.amount === 0.81309,
    knownRewardAmount: knownReward?.amount ?? null,
    knownJupiterPurchaseExcluded: !knownPurchaseCounted,
    heliusHttpRequests: result.heliusHttpRequests,
    rpcMethods: result.rpcMethods,
    retryCount: result.retryCount,
    scanLimitReached: result.scanLimitReached,
    scannedSignatures: result.scannedSignatures,
    executionTimeMs,
    unparsedTransactionCount: result.unparsedTransactionCount,
    unparsedTransactions: result.unparsedTransactions,
  }, null, 2));
}
