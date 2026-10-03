import { performance } from 'node:perf_hooks';
import { runRewardsCheck } from '../worker.mjs';

const WALLET = '6iLYbroGEJTvnHzXTxxL1krKKP4HakE4h1mqopxsnjWU';
const KNOWN_PURCHASE = '2PXbbPd95GoT6A9oFMBVtuvXewQjJL6eCWFRABLCe71ssiH6gr7FCnN1UXjWkZYF2wS54sSYQ9DLxBNLcJ754Znb';
const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY ?? '')}`;

if (!process.env.HELIUS_API_KEY) throw new Error('HELIUS_API_KEY is missing.');

async function signaturePage(before) {
  const options = { limit: 1000, commitment: 'finalized' };
  if (before) options.before = before;
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [WALLET, options] }),
  });
  if (!response.ok) throw new Error(`Signature cursor request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message);
  return payload.result;
}

const startedAt = performance.now();
const firstPage = await signaturePage();
const secondPage = await signaturePage(firstPage.at(-1)?.signature);
const firstTwoThousand = [...firstPage, ...secondPage];
const cursor = secondPage.at(-1)?.signature;
const knownPurchaseIndex = firstTwoThousand.findIndex((entry) => entry.signature === KNOWN_PURCHASE);
const continuation = await runRewardsCheck(WALLET, process.env.HELIUS_API_KEY, {
  before: cursor,
  maxSignatures: 2000,
});

console.log(JSON.stringify({
  continuationRewards: continuation.ansemRewards,
  continuationDistributionCount: continuation.distributionCount,
  continuationMostRecentReward: continuation.lastReward,
  continuationOldestReward: continuation.transactions.at(-1) ?? null,
  continuationExhaustedHistory: !continuation.scanLimitReached,
  continuationScannedSignatures: continuation.scannedSignatures,
  knownJupiterPurchaseIndexInFirstSegment: knownPurchaseIndex,
  knownJupiterPurchaseWasScanned: knownPurchaseIndex >= 0,
  heliusHttpRequestsIncludingCursor: continuation.heliusHttpRequests + 2,
  rpcMethodsIncludingCursor: continuation.rpcMethods + 2,
  retryCount: continuation.retryCount,
  executionTimeMs: Math.round(performance.now() - startedAt),
  unparsedTransactionCount: continuation.unparsedTransactionCount,
  unparsedTransactions: continuation.unparsedTransactions,
}, null, 2));
