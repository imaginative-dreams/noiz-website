import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { classifyRewardTransaction } from '../worker.mjs';

const CUTOFF = Date.parse('2026-09-12T00:00:00Z') / 1000;
const ANSEM_MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const REWARD_SOURCE = 'BusbejBxcb74pQ5uDfTzNgN2vmcqAMPh4q7tkZaUEnMb';
const VALIDATION_WALLET = '6iLYbroGEJTvnHzXTxxL1krKKP4HakE4h1mqopxsnjWU';
const EXPECTED_VALIDATION_RAW = 1_336_267_020n;
const EXPECTED_VALIDATION_COUNT = 2_056;
const COMPLEMENT_ONLY = process.env.COMPLEMENT_ONLY === '1';
const DATASET_UPPER = process.env.DATASET_UPPER
  ? Date.parse(process.env.DATASET_UPPER) / 1_000
  : Number.POSITIVE_INFINITY;
const BATCH_SIZE = 5;
const BATCH_INTERVAL_MS = 750;
const HOLDERS = [
  { rank: 1, wallet: '2nKeNVKDFsj6zGsU1DzgxRzXPKhxxFvCDhA9d5V3wT21' },
  { rank: 2, wallet: '7mhFPm6SSXu3VM9spvERxTt6nbLVZAnGFgUVLTMvt3Kn' },
  { rank: 3, wallet: 'GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52' },
  { rank: 4, wallet: 'CdtTxJo1mGicuN9cF8u4XTrXHeHCz5Hc9QquSnMUxsCq' },
  { rank: 5, wallet: 'BieeZkdnBAgNYknzo3RH2vku7FcPkFZMZmRJANh2TpW' },
];

const envText = fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
const keyMatch = envText.match(/^\s*HELIUS_API_KEY\s*=\s*["']?([^\r\n"']+)["']?\s*$/m);
if (!keyMatch) throw new Error('HELIUS_API_KEY is missing from .dev.vars.');
const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(keyMatch[1].trim())}`;

const telemetry = {
  signatureCalls: 0,
  transactionMethods: 0,
  httpRequests: 0,
  retries: 0,
  unavailable: [],
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(body) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    telemetry.httpRequests += 1;
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) return response.json();
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`RPC returned HTTP ${response.status}.`);
      }
    } catch (error) {
      if (attempt === 7) throw error;
    }
    telemetry.retries += 1;
    await sleep(Math.min(15_000, 750 * (2 ** attempt)));
  }
  throw new Error('RPC retry limit reached.');
}

async function signaturesSince(wallet) {
  const signatures = [];
  let before;
  for (;;) {
    const options = { limit: 1_000, commitment: 'finalized' };
    if (before) options.before = before;
    telemetry.signatureCalls += 1;
    const payload = await post({
      jsonrpc: '2.0', id: telemetry.signatureCalls,
      method: 'getSignaturesForAddress', params: [wallet, options],
    });
    if (payload.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
    const page = payload.result;
    for (const entry of page) {
      if (entry.blockTime !== null
        && entry.blockTime >= CUTOFF
        && entry.blockTime <= DATASET_UPPER
        && !entry.err) signatures.push(entry);
    }
    const oldestTimed = [...page].reverse().find((entry) => entry.blockTime !== null);
    if (page.length < 1_000 || (oldestTimed && oldestTimed.blockTime < CUTOFF)) break;
    before = page.at(-1)?.signature;
    if (!before) break;
  }
  return signatures;
}

async function signaturesNewerThan(address, until) {
  const signatures = [];
  let before;
  for (;;) {
    const options = { limit: 1_000, commitment: 'finalized', until };
    if (before) options.before = before;
    telemetry.signatureCalls += 1;
    const payload = await post({
      jsonrpc: '2.0', id: telemetry.signatureCalls,
      method: 'getSignaturesForAddress', params: [address, options],
    });
    if (payload.error) throw new Error(payload.error.message ?? JSON.stringify(payload.error));
    const page = payload.result;
    signatures.push(...page.filter((entry) => !entry.err));
    if (page.length < 1_000) break;
    before = page.at(-1)?.signature;
    if (!before) break;
  }
  return signatures;
}

async function transactionBatch(entries, idOffset, attempt = 0) {
  telemetry.transactionMethods += entries.length;
  const requests = entries.map((entry, index) => ({
    jsonrpc: '2.0', id: idOffset + index, method: 'getTransaction',
    params: [entry.signature, {
      encoding: 'json', commitment: 'finalized', maxSupportedTransactionVersion: 1,
    }],
  }));
  const payload = await post(requests);
  if (!Array.isArray(payload)) throw new Error('Unexpected transaction batch response.');
  const byId = new Map(payload.map((item) => [item.id, item]));
  const results = requests.map((request, index) => {
    const item = byId.get(request.id);
    return { entry: entries[index], transaction: item?.result ?? null, error: item?.error ?? null };
  });
  const successful = results.filter((result) => result.transaction);
  const failed = results.filter((result) => !result.transaction);
  const retryable = failed.filter((result) => {
    const message = result.error?.message?.toLowerCase() ?? '';
    return !result.error
      || result.error.code === -32005
      || result.error.code === -32603
      || message.includes('rate')
      || message.includes('too many');
  });
  const permanent = failed.filter((result) => !retryable.includes(result));
  if (retryable.length === 0 || attempt >= 6) return [...successful, ...permanent, ...retryable];
  telemetry.retries += 1;
  await sleep(Math.min(15_000, 1_000 * (2 ** attempt)));
  const retried = await transactionBatch(retryable.map((result) => result.entry), idOffset, attempt + 1);
  return [...successful, ...permanent, ...retried];
}

async function currentAnsemPrice() {
  const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${ANSEM_MINT}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return null;
  const pairs = await response.json();
  return pairs
    .filter((pair) => pair.chainId === 'solana'
      && pair.baseToken?.address === ANSEM_MINT
      && Number(pair.priceUsd) > 0)
    .sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0))
    .map((pair) => ({
      priceUsd: Number(pair.priceUsd),
      pairAddress: pair.pairAddress,
      dexId: pair.dexId,
      liquidityUsd: Number(pair.liquidity?.usd ?? 0),
    }))[0] ?? null;
}

const startedAt = performance.now();
const histories = new Map();
for (const holder of [...HOLDERS, { rank: 'validation', wallet: VALIDATION_WALLET }]) {
  const signatures = await signaturesSince(holder.wallet);
  histories.set(holder.wallet, signatures);
  console.log(JSON.stringify({ stage: 'signatures', rank: holder.rank, wallet: holder.wallet, successful: signatures.length }));
}

const sourceCache = JSON.parse(fs.readFileSync(
  new URL('../artifacts/noiz-rewards/source-signatures.json', import.meta.url), 'utf8',
));
const newSourceSignatures = await signaturesNewerThan(REWARD_SOURCE, sourceCache.newest_signature);
const sourceSignatures = [...newSourceSignatures, ...sourceCache.signatures]
  .filter((entry) => entry.blockTime !== null && entry.blockTime >= CUTOFF && !entry.err);
const sourceSet = new Set(sourceSignatures.map((entry) => entry.signature));
console.log(JSON.stringify({
  stage: 'source-index', cached: sourceCache.signatures.length,
  incremental: newSourceSignatures.length, usableSinceCutoff: sourceSet.size,
}));

const unique = new Map();
for (const holder of [...HOLDERS, { rank: 'validation', wallet: VALIDATION_WALLET }]) {
  for (const entry of histories.get(holder.wallet)) {
    if (COMPLEMENT_ONLY === sourceSet.has(entry.signature)) continue;
    const existing = unique.get(entry.signature) ?? { signature: entry.signature, blockTime: entry.blockTime, wallets: [] };
    existing.wallets.push(holder.wallet);
    unique.set(entry.signature, existing);
  }
}
const entries = [...unique.values()];
console.log(JSON.stringify({
  stage: 'transactions-start',
  complementOnly: COMPLEMENT_ONLY,
  successfulWalletSignatures: [...histories.values()].reduce((sum, list) => sum + list.length, 0),
  uniqueTransactions: entries.length,
  duplicateCallsAvoided: [...histories.values()].reduce((sum, list) => sum + list.length, 0) - entries.length,
}));

const rewards = new Map(
  [...HOLDERS, { wallet: VALIDATION_WALLET }].map((holder) => [holder.wallet, []]),
);
for (let index = 0; index < entries.length; index += BATCH_SIZE) {
  const batch = entries.slice(index, index + BATCH_SIZE);
  const results = await transactionBatch(batch, index + 1);
  for (const result of results) {
    if (!result.transaction) {
      telemetry.unavailable.push({ signature: result.entry.signature, error: result.error?.message ?? 'unavailable' });
      continue;
    }
    for (const wallet of result.entry.wallets) {
      const amount = classifyRewardTransaction(result.transaction, wallet);
      if (amount !== null) {
        rewards.get(wallet).push({
          signature: result.entry.signature,
          timestamp: result.transaction.blockTime ?? result.entry.blockTime,
          raw: BigInt(Math.round(amount * 1_000_000)),
        });
      }
    }
  }
  const processed = Math.min(index + BATCH_SIZE, entries.length);
  if (processed % 500 === 0 || processed === entries.length) {
    console.log(JSON.stringify({
      stage: 'transactions', processed, total: entries.length,
      percent: Number((processed / entries.length * 100).toFixed(2)),
      elapsedSeconds: Number(((performance.now() - startedAt) / 1_000).toFixed(1)),
      retries: telemetry.retries,
      unavailable: telemetry.unavailable.length,
    }));
  }
  if (processed < entries.length) await sleep(BATCH_INTERVAL_MS);
}

const datasetUpdatedAt = new Date();
const price = await currentAnsemPrice();
const results = HOLDERS.map((holder) => {
  const walletRewards = rewards.get(holder.wallet).sort((a, b) => a.timestamp - b.timestamp);
  const totalRaw = walletRewards.reduce((sum, reward) => sum + reward.raw, 0n);
  const rewardingSinceTimestamp = walletRewards[0]?.timestamp ?? null;
  const ansemEarned = Number(totalRaw) / 1_000_000;
  return {
    ...holder,
    rewardingSince: rewardingSinceTimestamp === null ? null : new Date(rewardingSinceTimestamp * 1_000).toISOString(),
    earnedInDays: rewardingSinceTimestamp === null
      ? null
      : Number(((datasetUpdatedAt.getTime() / 1_000 - rewardingSinceTimestamp) / 86_400).toFixed(6)),
    ansemEarned,
    ansemEarnedRaw: totalRaw.toString(),
    ansemUsdValue: price === null ? null : Number((ansemEarned * price.priceUsd).toFixed(6)),
    rewardCount: walletRewards.length,
    firstSignature: walletRewards[0]?.signature ?? null,
    lastRewardAt: walletRewards.at(-1)?.timestamp == null
      ? null : new Date(walletRewards.at(-1).timestamp * 1_000).toISOString(),
    lastSignature: walletRewards.at(-1)?.signature ?? null,
  };
});
const validationRewards = rewards.get(VALIDATION_WALLET).sort((a, b) => a.timestamp - b.timestamp);
const validationRaw = validationRewards.reduce((sum, reward) => sum + reward.raw, 0n);
const validation = {
  wallet: VALIDATION_WALLET,
  rewardCount: validationRewards.length,
  ansemEarnedRaw: validationRaw.toString(),
  ansemEarned: Number(validationRaw) / 1_000_000,
  expectedRewardCount: EXPECTED_VALIDATION_COUNT,
  expectedAnsemEarnedRaw: EXPECTED_VALIDATION_RAW.toString(),
  passed: validationRewards.length === EXPECTED_VALIDATION_COUNT
    && validationRaw === EXPECTED_VALIDATION_RAW,
};

console.log(`FINAL ${JSON.stringify({
  cutoff: new Date(CUTOFF * 1_000).toISOString(),
  datasetUpdatedAt: datasetUpdatedAt.toISOString(),
  ansemPrice: price,
  results,
  validation,
  telemetry: {
    ...telemetry,
    elapsedSeconds: Number(((performance.now() - startedAt) / 1_000).toFixed(1)),
    estimatedHeliusCredits: telemetry.signatureCalls * 10 + telemetry.transactionMethods * 10,
  },
})}`);
