import fs from 'node:fs/promises';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyRewardTransactionRaw } from '../worker.mjs';

export const NOIZ_MINT = 'Adgt7dseCq71eN6GDuoUgpsNQp81ZNhq24nrF7pxpump';
export const ANSEM_MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
export const REWARD_SOURCE = 'BusbejBxcb74pQ5uDfTzNgN2vmcqAMPh4q7tkZaUEnMb';
export const ANSEM_WALLET = 'GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52';
export const DAILY_CREDIT_LIMIT = 200;
export const WEEKLY_CREDIT_LIMIT = 20_000;
export const EXPECTED_DAILY_RPC_CALLS = 5;

const DATASET_URL = new URL('../public/data/noiz-holder-rewards.json', import.meta.url);
const SIGNATURE_PAGE_SIZE = 1_000;
const TRANSACTION_BATCH_SIZE = 5;
const TRANSACTION_BATCH_INTERVAL_MS = 750;
const RPC_MAX_RETRIES = 3;
const RPC_CREDITS = 10;
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

class RpcError extends Error {}
export class BudgetError extends Error {}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isoFromSeconds = (seconds) => seconds == null ? null : new Date(seconds * 1_000).toISOString();
const rawFromUi = (value) => BigInt(Math.round(Number(value ?? 0) * 1_000_000));
const uiFromRaw = (value) => Number(value) / 1_000_000;
const earnedDays = (since, updatedAt) => since == null ? null
  : Number(((Date.parse(updatedAt) - Date.parse(since)) / 86_400_000).toFixed(6));

function decodeBase58(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  let number = 0n;
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return null;
    number = number * 58n + BigInt(digit);
  }
  let hex = number.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const decoded = hex === '00' ? [] : hex.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16));
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === '1') leadingZeroes += 1;
  return Uint8Array.from([...new Array(leadingZeroes).fill(0), ...decoded]);
}

const mod = (value, prime) => ((value % prime) + prime) % prime;
function powMod(base, exponent, prime) {
  let result = 1n;
  let factor = mod(base, prime);
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = mod(result * factor, prime);
    factor = mod(factor * factor, prime);
    power >>= 1n;
  }
  return result;
}

export function isOnCurve(address) {
  const bytes = decodeBase58(address);
  if (!bytes || bytes.length !== 32) return false;
  const copy = Uint8Array.from(bytes);
  const sign = copy[31] >> 7;
  copy[31] &= 0x7f;
  let y = 0n;
  for (let index = 31; index >= 0; index -= 1) y = (y << 8n) | BigInt(copy[index]);
  const prime = (1n << 255n) - 19n;
  if (y >= prime) return false;
  const d = mod(-121665n * powMod(121666n, prime - 2n, prime), prime);
  const ySquared = mod(y * y, prime);
  const xSquared = mod((ySquared - 1n) * powMod(d * ySquared + 1n, prime - 2n, prime), prime);
  let x = powMod(xSquared, (prime + 3n) / 8n, prime);
  if (mod(x * x - xSquared, prime) !== 0n) x = mod(x * powMod(2n, (prime - 1n) / 4n, prime), prime);
  if (mod(x * x - xSquared, prime) !== 0n) return false;
  return !(x === 0n && sign === 1);
}

export function isValidSignature(value) {
  const bytes = typeof value === 'string' ? decodeBase58(value) : null;
  return Boolean(bytes && bytes.length === 64);
}

export function holderEligibility(wallet, metadata) {
  if (wallet === ANSEM_WALLET) return { eligible: true, reason: 'verified Ansem-controlled address' };
  if (!isOnCurve(wallet)) return { eligible: false, reason: 'off-curve program authority', ownerProgram: metadata?.owner ?? null };
  if (metadata && (metadata.executable || metadata.owner !== SYSTEM_PROGRAM)) {
    return { eligible: false, reason: 'program-owned operational account', ownerProgram: metadata.owner };
  }
  return { eligible: true, reason: 'normal holder wallet' };
}

export function createTelemetry(limit) {
  return {
    limit,
    estimatedHeliusCredits: 0,
    getSignaturesForAddress: 0,
    getTransaction: 0,
    otherRpcMethods: 0,
    httpRequests: 0,
    retries: 0,
    unavailableTransactions: [],
  };
}

function reserveCredits(telemetry, method, count = 1) {
  const additional = count * RPC_CREDITS;
  if (telemetry.estimatedHeliusCredits + additional > telemetry.limit) {
    throw new BudgetError(`Helius ceiling would be exceeded by ${method}: ${telemetry.estimatedHeliusCredits} + ${additional} > ${telemetry.limit}.`);
  }
  telemetry.estimatedHeliusCredits += additional;
  if (method === 'getSignaturesForAddress') telemetry.getSignaturesForAddress += count;
  else if (method === 'getTransaction') telemetry.getTransaction += count;
  else telemetry.otherRpcMethods += count;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1_000;
  return Math.min(10_000, 750 * (2 ** attempt));
}

export function createRpcClient(apiKey, telemetry, fetchImpl = fetch) {
  if (!apiKey) throw new Error('HELIUS_API_KEY is missing. Refusing to make RPC calls.');
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`;
  return async function rpc(method, params, options = {}) {
    const requests = options.batch ?? null;
    const methodCount = requests?.length ?? 1;
    for (let attempt = 0; attempt <= RPC_MAX_RETRIES; attempt += 1) {
      reserveCredits(telemetry, method, methodCount);
      telemetry.httpRequests += 1;
      let response;
      try {
        response = await fetchImpl(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requests ?? { jsonrpc: '2.0', id: 1, method, params }),
        });
      } catch (error) {
        if (attempt === RPC_MAX_RETRIES) throw new RpcError(`RPC ${method} failed: ${error.message}`);
        telemetry.retries += 1;
        await sleep(retryDelay(null, attempt));
        continue;
      }
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < RPC_MAX_RETRIES) {
        telemetry.retries += 1;
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!response.ok) throw new RpcError(`RPC ${method} returned HTTP ${response.status}.`);
      const payload = await response.json();
      if (!requests && payload.error) throw new RpcError(`RPC ${method}: ${payload.error.message ?? 'request failed.'}`);
      return requests ? payload : payload.result;
    }
    throw new RpcError(`RPC ${method} retry limit reached.`);
  };
}

export async function signaturesAfterCursor(rpc, wallet, cursor, cursorAt, onPage = null) {
  const useSignatureCursor = isValidSignature(cursor);
  const cursorSeconds = cursorAt == null ? null : Date.parse(cursorAt) / 1_000;
  if (!useSignatureCursor && !Number.isFinite(cursorSeconds)) {
    throw new Error(`Existing holder ${wallet} has no valid incremental cursor.`);
  }
  const entries = [];
  let before;
  let newestSignature = useSignatureCursor ? cursor : null;
  for (;;) {
    const options = { commitment: 'finalized', limit: SIGNATURE_PAGE_SIZE };
    if (useSignatureCursor) options.until = cursor;
    if (before) options.before = before;
    const page = await rpc('getSignaturesForAddress', [wallet, options]);
    if (!Array.isArray(page)) throw new RpcError(`Unexpected signature response for ${wallet}.`);
    if (!before && page[0]?.signature) newestSignature = page[0].signature;
    const qualifying = page.filter((entry) => !entry.err
      && (useSignatureCursor || entry.blockTime == null || entry.blockTime > cursorSeconds));
    entries.push(...qualifying);
    if (onPage) onPage(qualifying);
    const oldestTimed = [...page].reverse().find((entry) => entry.blockTime != null);
    if (page.length < SIGNATURE_PAGE_SIZE || (!useSignatureCursor && oldestTimed && oldestTimed.blockTime <= cursorSeconds)) break;
    before = page.at(-1)?.signature;
    if (!before) break;
  }
  return { entries, newestSignature, cursorMode: useSignatureCursor ? 'signature' : 'timestamp' };
}

async function getTransactions(rpc, entries, telemetry) {
  const results = new Map();
  for (let index = 0; index < entries.length; index += TRANSACTION_BATCH_SIZE) {
    const chunk = entries.slice(index, index + TRANSACTION_BATCH_SIZE);
    const requests = chunk.map((entry, offset) => ({
      jsonrpc: '2.0', id: index + offset + 1, method: 'getTransaction',
      params: [entry.signature, { encoding: 'json', commitment: 'finalized', maxSupportedTransactionVersion: 1 }],
    }));
    const payload = await rpc('getTransaction', null, { batch: requests });
    if (!Array.isArray(payload)) throw new RpcError('Unexpected transaction batch response.');
    const byId = new Map(payload.map((item) => [item.id, item]));
    for (let offset = 0; offset < chunk.length; offset += 1) {
      const item = byId.get(index + offset + 1);
      if (item?.error || !item?.result) {
        telemetry.unavailableTransactions.push({
          signature: chunk[offset].signature,
          error: item?.error?.message ?? 'Transaction unavailable.',
        });
      } else {
        results.set(chunk[offset].signature, item.result);
      }
    }
    if (index + TRANSACTION_BATCH_SIZE < entries.length) await sleep(TRANSACTION_BATCH_INTERVAL_MS);
  }
  if (telemetry.unavailableTransactions.length > 0) {
    throw new RpcError(`${telemetry.unavailableTransactions.length} transactions were unavailable; confirmed rewards were preserved.`);
  }
  return results;
}

function tokenAmount(account) {
  const info = account?.account?.data?.parsed?.info ?? account?.data?.parsed?.info;
  return info?.tokenAmount?.amount == null ? 0n : BigInt(info.tokenAmount.amount);
}

export async function refreshCurrentPositions(rpc) {
  const [largest, supply] = await Promise.all([
    rpc('getTokenLargestAccounts', [NOIZ_MINT, { commitment: 'finalized' }]),
    rpc('getTokenSupply', [NOIZ_MINT, { commitment: 'finalized' }]),
  ]);
  if (!Array.isArray(largest?.value) || largest.value.length < 5) throw new RpcError('NOIZ largest-account response is incomplete.');
  const tokenAccounts = largest.value.map((entry) => entry.address);
  const [resolved, ansemAccounts] = await Promise.all([
    rpc('getMultipleAccounts', [tokenAccounts, { encoding: 'jsonParsed', commitment: 'finalized' }]),
    rpc('getTokenAccountsByOwner', [ANSEM_WALLET, { mint: NOIZ_MINT }, { encoding: 'jsonParsed', commitment: 'finalized' }]),
  ]);
  const candidates = new Map();
  resolved?.value?.forEach((account, index) => {
    const info = account?.data?.parsed?.info;
    if (!info?.owner || info.mint !== NOIZ_MINT) return;
    const current = candidates.get(info.owner) ?? { wallet: info.owner, rawBalance: 0n, tokenAccounts: [] };
    current.rawBalance += tokenAmount(account);
    current.tokenAccounts.push(tokenAccounts[index]);
    candidates.set(info.owner, current);
  });
  const ansemRaw = (ansemAccounts?.value ?? []).reduce((total, account) => total + tokenAmount(account), 0n);
  if (ansemRaw > 0n) {
    candidates.set(ANSEM_WALLET, {
      wallet: ANSEM_WALLET,
      rawBalance: ansemRaw,
      tokenAccounts: (ansemAccounts.value ?? []).map((entry) => entry.pubkey),
    });
  }

  const owners = [...candidates.keys()];
  const ownerMetadata = await rpc('getMultipleAccounts', [owners, { encoding: 'base64', commitment: 'finalized' }]);
  const exclusions = [];
  const eligible = [];
  owners.forEach((wallet, index) => {
    const decision = holderEligibility(wallet, ownerMetadata?.value?.[index]);
    if (!decision.eligible) {
      exclusions.push({ wallet, reason: decision.reason, ownerProgram: decision.ownerProgram });
    } else {
      eligible.push(candidates.get(wallet));
    }
  });
  eligible.sort((a, b) => a.rawBalance === b.rawBalance
    ? a.wallet.localeCompare(b.wallet)
    : a.rawBalance > b.rawBalance ? -1 : 1);
  if (eligible.length < 5) throw new RpcError('Infrastructure filtering left fewer than five NOIZ holders.');
  const decimals = Number(supply?.value?.decimals);
  const supplyRaw = BigInt(supply?.value?.amount ?? 0);
  if (!Number.isInteger(decimals) || supplyRaw <= 0n) throw new RpcError('NOIZ supply response is invalid.');
  const divisor = 10 ** decimals;
  const publicPosition = (holder, rank = null) => ({
    ...(rank == null ? {} : { rank }),
    wallet: holder.wallet,
    label: holder.wallet === ANSEM_WALLET ? 'ANSEM' : null,
    noizBalance: Number(holder.rawBalance) / divisor,
    supplyPercentage: Number(holder.rawBalance * 100_000_000n / supplyRaw) / 1_000_000,
    tokenAccount: holder.tokenAccounts[0] ?? null,
  });
  const holders = eligible.slice(0, 5).map((holder, index) => publicPosition(holder, index + 1));
  const ansemHolder = candidates.get(ANSEM_WALLET) ?? { wallet: ANSEM_WALLET, rawBalance: 0n, tokenAccounts: [] };
  return { holders, ansemPosition: publicPosition(ansemHolder), exclusions };
}

export function migrateHistory(dataset) {
  const history = structuredClone(dataset.holderHistory ?? {});
  for (const record of [...(dataset.holders ?? []), dataset.ansem].filter(Boolean)) {
    const existing = history[record.wallet] ?? {};
    history[record.wallet] = {
      ...record,
      ...existing,
      wallet: record.wallet,
      rewardStatus: existing.rewardStatus ?? record.rewardStatus ?? 'ready',
      ansemEarnedRaw: existing.ansemEarnedRaw ?? rawFromUi(record.ansemEarned).toString(),
      rewardCursorSignature: existing.rewardCursorSignature ?? record.rewardCursorSignature ?? null,
    };
  }
  return history;
}

export function pendingState(wallet) {
  return {
    wallet,
    label: wallet === ANSEM_WALLET ? 'ANSEM' : null,
    rewardStatus: 'pending',
    pendingReason: 'Historical rewards require a deliberate manual initialization.',
    rewardingSince: null,
    earnedInDays: null,
    ansemEarned: null,
    ansemEarnedRaw: null,
    ansemUsdValue: null,
    rewardCount: null,
    firstRewardAt: null,
    lastRewardAt: null,
    lastSignature: null,
    rewardCursorSignature: null,
  };
}

function mergePublicPosition(position, state, priceUsd, rewardsUpdatedAt) {
  if (!state || state.rewardStatus !== 'ready') {
    return { ...(state ?? pendingState(position.wallet)), ...position, rewardStatus: 'pending' };
  }
  const raw = BigInt(state.ansemEarnedRaw ?? rawFromUi(state.ansemEarned));
  const earned = uiFromRaw(raw);
  return {
    ...state,
    ...position,
    rewardStatus: 'ready',
    earnedInDays: earnedDays(state.rewardingSince, rewardsUpdatedAt),
    ansemEarnedRaw: raw.toString(),
    ansemEarned: earned,
    ansemUsdValue: Number((earned * priceUsd).toFixed(6)),
  };
}

async function getAnsemPrice(previousPrice, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`https://api.dexscreener.com/tokens/v1/solana/${ANSEM_MINT}`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const pairs = await response.json();
    const best = pairs
      .filter((pair) => pair.chainId === 'solana' && pair.baseToken?.address === ANSEM_MINT && Number(pair.priceUsd) > 0)
      .sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0))[0];
    if (!best) throw new Error('No liquid ANSEM pair found.');
    return { price: Number(best.priceUsd), refreshed: true };
  } catch (error) {
    if (!(Number(previousPrice) > 0)) throw new Error(`DexScreener price unavailable and no prior price exists: ${error.message}`);
    return { price: Number(previousPrice), refreshed: false, warning: error.message };
  }
}

function assertExistingDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.holders) || dataset.holders.length !== 5) throw new Error('Existing dataset must contain exactly five holders.');
  if (dataset.ansem?.wallet !== ANSEM_WALLET) throw new Error('Dedicated Ansem record is missing or inconsistent.');
}

export async function buildDailyDataset({ dataset, apiKey, now = new Date(), fetchImpl = fetch }) {
  assertExistingDataset(dataset);
  const started = performance.now();
  const telemetry = createTelemetry(DAILY_CREDIT_LIMIT);
  const rpc = createRpcClient(apiKey, telemetry, fetchImpl);
  const { holders: positions, ansemPosition, exclusions } = await refreshCurrentPositions(rpc);
  const priceResult = await getAnsemPrice(dataset.ansemPriceUsd, fetchImpl);
  const updatedAt = now.toISOString();
  const rewardsUpdatedAt = dataset.rewardsUpdatedAt ?? dataset.datasetUpdatedAt;
  const history = migrateHistory(dataset);
  const holders = positions.map((position) => mergePublicPosition(position, history[position.wallet], priceResult.price, rewardsUpdatedAt));
  const ansem = mergePublicPosition(ansemPosition, history[ANSEM_WALLET], priceResult.price, rewardsUpdatedAt);
  for (const holder of holders) history[holder.wallet] = { ...holder };
  history[ANSEM_WALLET] = { ...ansem };
  const rankingChanged = dataset.holders.some((holder, index) => holder.wallet !== holders[index].wallet);
  const nextDataset = {
    ...dataset,
    datasetUpdatedAt: updatedAt,
    rankingUpdatedAt: updatedAt,
    priceUpdatedAt: priceResult.refreshed ? updatedAt : (dataset.priceUpdatedAt ?? dataset.datasetUpdatedAt),
    rewardsUpdatedAt,
    ansemPriceUsd: priceResult.price,
    holders,
    ansem,
    holderHistory: history,
    updateState: {
      ...(dataset.updateState ?? {}),
      version: 2,
      lastDailyRun: {
        completedAt: updatedAt,
        estimatedHeliusCredits: telemetry.estimatedHeliusCredits,
        rpcCalls: telemetry.getSignaturesForAddress + telemetry.getTransaction + telemetry.otherRpcMethods,
        retries: telemetry.retries,
        priceRefreshed: priceResult.refreshed,
      },
    },
  };
  return {
    dataset: nextDataset,
    report: {
      mode: 'daily',
      rankingChanged,
      topFiveWallets: holders.map((holder) => holder.wallet),
      priceRefreshed: priceResult.refreshed,
      exclusions,
      telemetry: { ...telemetry, elapsedSeconds: Number(((performance.now() - started) / 1_000).toFixed(2)) },
    },
  };
}

export async function buildWeeklyDataset({ dataset, apiKey, now = new Date(), fetchImpl = fetch }) {
  assertExistingDataset(dataset);
  const started = performance.now();
  const telemetry = createTelemetry(WEEKLY_CREDIT_LIMIT);
  const rpc = createRpcClient(apiKey, telemetry, fetchImpl);
  const history = migrateHistory(dataset);
  const readyWallets = [...new Set([...dataset.holders, dataset.ansem]
    .filter((record) => (history[record.wallet]?.rewardStatus ?? 'ready') === 'ready')
    .map((record) => record.wallet))];
  const entriesBySignature = new Map();
  const plans = new Map();
  const fallbackAt = dataset.rewardsUpdatedAt ?? dataset.datasetUpdatedAt;
  try {
    for (const wallet of readyWallets) {
      const state = history[wallet];
      const incremental = await signaturesAfterCursor(
        rpc,
        wallet,
        state.rewardCursorSignature,
        fallbackAt,
        (entries) => {
          for (const entry of entries) {
            const item = entriesBySignature.get(entry.signature) ?? { ...entry, wallets: new Set() };
            item.wallets.add(wallet);
            entriesBySignature.set(entry.signature, item);
          }
          const projectedCredits = telemetry.estimatedHeliusCredits + entriesBySignature.size * RPC_CREDITS;
          if (projectedCredits > WEEKLY_CREDIT_LIMIT) {
            throw new BudgetError(`Weekly reward backlog requires at least ${projectedCredits} estimated credits.`);
          }
        },
      );
      plans.set(wallet, incremental);
    }
    const entries = [...entriesBySignature.values()].map((entry) => ({ ...entry, wallets: [...entry.wallets] }));
    if (telemetry.estimatedHeliusCredits + entries.length * RPC_CREDITS > WEEKLY_CREDIT_LIMIT) {
      throw new BudgetError('Weekly reward backlog does not fit the 20,000-credit ceiling.');
    }
    const transactions = await getTransactions(rpc, entries, telemetry);
    const additions = new Map(readyWallets.map((wallet) => [wallet, []]));
    for (const entry of entries) {
      const transaction = transactions.get(entry.signature);
      for (const wallet of entry.wallets) {
        const reward = classifyRewardTransactionRaw(transaction, wallet);
        if (!reward) continue;
        if (reward.decimals !== 6) throw new Error(`Unexpected ANSEM decimals ${reward.decimals} in ${entry.signature}.`);
        additions.get(wallet).push({ signature: entry.signature, raw: reward.rawAmount, timestamp: transaction.blockTime ?? entry.blockTime });
      }
    }
    const updatedAt = now.toISOString();
    for (const wallet of readyWallets) {
      const state = history[wallet];
      const rewards = additions.get(wallet).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
      let totalRaw = BigInt(state.ansemEarnedRaw ?? rawFromUi(state.ansemEarned));
      for (const reward of rewards) totalRaw += reward.raw;
      const first = rewards[0];
      const last = rewards.at(-1);
      if (!state.rewardingSince && first?.timestamp != null) {
        state.rewardingSince = isoFromSeconds(first.timestamp);
        state.firstRewardAt = state.rewardingSince;
      }
      if (last) {
        state.lastRewardAt = isoFromSeconds(last.timestamp);
        state.lastSignature = last.signature;
      }
      state.rewardCount = Number(state.rewardCount ?? 0) + rewards.length;
      state.ansemEarnedRaw = totalRaw.toString();
      state.ansemEarned = uiFromRaw(totalRaw);
      state.ansemUsdValue = Number((state.ansemEarned * dataset.ansemPriceUsd).toFixed(6));
      state.earnedInDays = earnedDays(state.rewardingSince, updatedAt);
      state.rewardCursorSignature = plans.get(wallet).newestSignature ?? state.rewardCursorSignature;
      state.rewardStatus = 'ready';
    }
    const holders = dataset.holders.map((position) => mergePublicPosition(position, history[position.wallet], dataset.ansemPriceUsd, updatedAt));
    const ansem = mergePublicPosition(dataset.ansem, history[ANSEM_WALLET], dataset.ansemPriceUsd, updatedAt);
    for (const holder of holders) history[holder.wallet] = { ...holder };
    history[ANSEM_WALLET] = { ...ansem };
    const nextDataset = {
      ...dataset,
      datasetUpdatedAt: updatedAt,
      rewardsUpdatedAt: updatedAt,
      holders,
      ansem,
      holderHistory: history,
      updateState: {
        ...(dataset.updateState ?? {}),
        version: 2,
        lastWeeklyRun: {
          status: 'confirmed',
          completedAt: updatedAt,
          estimatedHeliusCredits: telemetry.estimatedHeliusCredits,
          getSignaturesForAddressCalls: telemetry.getSignaturesForAddress,
          getTransactionCalls: telemetry.getTransaction,
          retries: telemetry.retries,
        },
      },
    };
    return {
      completed: true,
      dataset: nextDataset,
      report: {
        mode: 'weekly',
        status: 'confirmed',
        uniqueTransactionsDownloaded: entries.length,
        newRewardsByWallet: Object.fromEntries(readyWallets.map((wallet) => [wallet, additions.get(wallet).length])),
        telemetry: { ...telemetry, elapsedSeconds: Number(((performance.now() - started) / 1_000).toFixed(2)) },
      },
    };
  } catch (error) {
    if (!(error instanceof BudgetError)) throw error;
    return {
      completed: false,
      dataset,
      report: {
        mode: 'weekly',
        status: 'preserved-budget-insufficient',
        reason: error.message,
        telemetry: { ...telemetry, elapsedSeconds: Number(((performance.now() - started) / 1_000).toFixed(2)) },
      },
    };
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='));
  const mode = modeArgument?.split('=')[1];
  if (!['daily', 'weekly'].includes(mode)) throw new Error('Choose --mode=daily or --mode=weekly.');
  if (!process.env.HELIUS_API_KEY) throw new Error('HELIUS_API_KEY is missing. Add it to .dev.vars locally or the GitHub Actions secret.');
  const existingText = await fs.readFile(DATASET_URL, 'utf8');
  const existing = JSON.parse(existingText);
  console.log(JSON.stringify({ stage: 'start', mode, dryRun, previousTimestamp: existing.datasetUpdatedAt }));
  const builder = mode === 'daily' ? buildDailyDataset : buildWeeklyDataset;
  const result = await builder({ dataset: existing, apiKey: process.env.HELIUS_API_KEY });
  const generatedText = `${JSON.stringify(result.dataset, null, 2)}\n`;
  const changed = generatedText !== existingText.replace(/\r\n/g, '\n');
  console.log(JSON.stringify({ stage: 'complete', ...result.report, jsonChanged: changed, dryRun }));
  if (!dryRun && changed) {
    const temporaryUrl = new URL(`${DATASET_URL.pathname}.tmp`, DATASET_URL);
    await fs.writeFile(temporaryUrl, generatedText, 'utf8');
    await fs.rename(temporaryUrl, DATASET_URL);
  }
  if (dryRun) console.log('DRY_RUN: dataset was not written.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href) {
  main().catch((error) => {
    console.error(`UPDATE_FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
