const NOIZ_MINT = 'Adgt7dseCq71eN6GDuoUgpsNQp81ZNhq24nrF7pxpump';
const ANSEM_MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const REWARDS_AUTHORITY = '5ebAXUTU7rnenM5KxCCaTVELA89EQdFy5wrp3trduTji';
const REWARDS_TOKEN_ACCOUNT = 'BusbejBxcb74pQ5uDfTzNgN2vmcqAMPh4q7tkZaUEnMb';
const DISTRIBUTE_DISCRIMINATOR = '623691610246ad2b';
const TOKEN_PROGRAMS = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
]);
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAX_SIGNATURES = 2000;
const SIGNATURE_PAGE_SIZE = 1000;
const TRANSACTION_BATCH_SIZE = 5;
const TRANSACTION_BATCH_INTERVAL_MS = 750;
const RPC_MAX_RETRIES = 5;
const CACHE_SECONDS = 300;

class RpcError extends Error {}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response, attempt) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return Math.min(30_000, 1000 * (2 ** attempt));
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

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

function hexPrefix(value, byteLength) {
  const bytes = decodeBase58(value);
  if (!bytes || bytes.length < byteLength) return '';
  return [...bytes.slice(0, byteLength)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isValidSolanaAddress(value) {
  const decoded = decodeBase58(value);
  return Boolean(decoded && decoded.length === 32 && value.length >= 32 && value.length <= 44);
}

function accountKeys(transaction) {
  const messageKeys = transaction?.transaction?.message?.accountKeys ?? [];
  const staticKeys = messageKeys.map((key) => (typeof key === 'string' ? key : key.pubkey));
  const loaded = transaction?.meta?.loadedAddresses ?? {};
  return [...staticKeys, ...(loaded.writable ?? []), ...(loaded.readonly ?? [])];
}

function findDistributionInstruction(transaction, keys = accountKeys(transaction)) {
  const topLevel = transaction?.transaction?.message?.instructions ?? [];
  return topLevel.findIndex((instruction) => {
    const program = instruction.programId ?? keys[instruction.programIdIndex];
    const accounts = instruction.accounts ?? [];
    const noizMint = typeof accounts[2] === 'number' ? keys[accounts[2]] : accounts[2];
    const quoteMint = typeof accounts[5] === 'number' ? keys[accounts[5]] : accounts[5];
    return program === PUMP_PROGRAM
      && hexPrefix(instruction.data, 8) === DISTRIBUTE_DISCRIMINATOR
      && noizMint === NOIZ_MINT
      && quoteMint === ANSEM_MINT;
  });
}

function transferCheckedAmount(data) {
  const bytes = decodeBase58(data);
  if (!bytes || bytes.length < 10 || bytes[0] !== 12) return null;
  let rawAmount = 0n;
  for (let index = 0; index < 8; index += 1) {
    rawAmount |= BigInt(bytes[index + 1]) << BigInt(index * 8);
  }
  return { rawAmount, decimals: bytes[9] };
}

/**
 * Return the ANSEM amount sent to `wallet` by one proven NOIZ holder-reward
 * distribution. Returns null for every other kind of transaction.
 */
export function classifyRewardTransaction(transaction, wallet) {
  if (!transaction || transaction.meta?.err) return null;
  const keys = accountKeys(transaction);
  const distributeIndex = findDistributionInstruction(transaction, keys);
  if (distributeIndex < 0) return null;

  const tokenBalances = [
    ...(transaction.meta?.preTokenBalances ?? []),
    ...(transaction.meta?.postTokenBalances ?? []),
  ];
  const walletTokenAccounts = new Set(
    tokenBalances
      .filter((balance) => balance.owner === wallet && balance.mint === ANSEM_MINT)
      .map((balance) => keys[balance.accountIndex])
      .filter(Boolean),
  );
  if (walletTokenAccounts.size === 0) return null;

  const inner = (transaction.meta?.innerInstructions ?? [])
    .find((group) => group.index === distributeIndex)?.instructions ?? [];
  let rawTotal = 0n;
  let decimals = null;
  for (const instruction of inner) {
    const info = instruction.parsed?.info;
    if (instruction.parsed?.type === 'transferChecked') {
      if (info.mint !== ANSEM_MINT || !walletTokenAccounts.has(info.destination)) continue;
      const amount = BigInt(info.tokenAmount.amount);
      rawTotal += amount;
      decimals = info.tokenAmount.decimals;
      continue;
    }

    const program = instruction.programId ?? keys[instruction.programIdIndex];
    const accounts = instruction.accounts ?? [];
    const source = keys[accounts[0]];
    const mint = keys[accounts[1]];
    const destination = keys[accounts[2]];
    const authority = keys[accounts[3]];
    const transfer = transferCheckedAmount(instruction.data);
    if (!transfer || mint !== ANSEM_MINT || !walletTokenAccounts.has(destination)) continue;

    // These two observed accounts are corroborating evidence. They are not the
    // primary classifier, so a future account rotation will not hide rewards.
    const knownSource = source === REWARDS_TOKEN_ACCOUNT;
    const knownAuthority = authority === REWARDS_AUTHORITY;
    if (!TOKEN_PROGRAMS.has(program)) continue;
    // If either observed reward account is present, require the known pair. A
    // future rotation can still pass through the primary on-chain checks.
    if ((knownSource || knownAuthority) && !(knownSource && knownAuthority)) continue;
    rawTotal += transfer.rawAmount;
    decimals = transfer.decimals;
  }

  if (rawTotal === 0n || decimals === null) return null;
  return Number(rawTotal) / (10 ** decimals);
}

async function rpc(rpcUrl, method, params, telemetry, id = 1) {
  let response;
  for (let attempt = 0; attempt <= RPC_MAX_RETRIES; attempt += 1) {
    telemetry.heliusHttpRequests += 1;
    telemetry.rpcMethods += 1;
    try {
      response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      });
    } catch (error) {
      throw new RpcError(`RPC request failed: ${error.message}`);
    }
    if (![429, 503].includes(response.status) || attempt === RPC_MAX_RETRIES) break;
    telemetry.retryCount += 1;
    await sleep(retryDelay(response, attempt));
  }
  if (!response.ok) throw new RpcError(`RPC returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new RpcError(payload.error.message ?? 'RPC error');
  return payload.result;
}

async function getSignatures(rpcUrl, wallet, telemetry, scanOptions = {}) {
  const signatures = [];
  const maxSignatures = scanOptions.maxSignatures ?? MAX_SIGNATURES;
  let before = scanOptions.before;
  let exhausted = false;
  while (signatures.length < maxSignatures && !exhausted) {
    const limit = Math.min(SIGNATURE_PAGE_SIZE, maxSignatures - signatures.length);
    const options = { limit, commitment: 'finalized' };
    if (before) options.before = before;
    const page = await rpc(rpcUrl, 'getSignaturesForAddress', [wallet, options], telemetry);
    if (!Array.isArray(page)) throw new RpcError('Unexpected signature response');
    signatures.push(...page.filter((entry) => !entry.err));
    exhausted = page.length < limit;
    before = page.at(-1)?.signature;
    if (!before) exhausted = true;
  }
  return { signatures, scanLimitReached: !exhausted, nextBefore: before };
}

async function getTransactionBatch(rpcUrl, signatures, idOffset, telemetry) {
  const requests = signatures.map((entry, index) => ({
    jsonrpc: '2.0',
    id: idOffset + index,
    method: 'getTransaction',
    params: [entry.signature, { encoding: 'json', commitment: 'finalized', maxSupportedTransactionVersion: 0 }],
  }));
  let response;
  for (let attempt = 0; attempt <= RPC_MAX_RETRIES; attempt += 1) {
    telemetry.heliusHttpRequests += 1;
    telemetry.rpcMethods += requests.length;
    try {
      response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requests),
      });
    } catch (error) {
      throw new RpcError(`RPC batch failed: ${error.message}`);
    }
    if (![429, 503].includes(response.status) || attempt === RPC_MAX_RETRIES) break;
    telemetry.retryCount += 1;
    await sleep(retryDelay(response, attempt));
  }
  if (!response.ok) throw new RpcError(`RPC batch returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new RpcError('Unexpected transaction batch response');
  const byId = new Map(payload.map((item) => [item.id, item]));
  return requests.map((request) => {
    const item = byId.get(request.id);
    if (item?.error || !item?.result) {
      telemetry.unparsedTransactions.push({
        signature: signatures[request.id - idOffset]?.signature,
        reason: item?.error?.message ?? 'Transaction was unavailable from RPC.',
      });
      return null;
    }
    return item.result;
  });
}

async function mapBatches(rpcUrl, signatures, telemetry) {
  const chunks = [];
  for (let index = 0; index < signatures.length; index += TRANSACTION_BATCH_SIZE) {
    chunks.push({ entries: signatures.slice(index, index + TRANSACTION_BATCH_SIZE), idOffset: index + 1 });
  }
  const results = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    results.push(await getTransactionBatch(rpcUrl, chunk.entries, chunk.idOffset, telemetry));
    if (index < chunks.length - 1) await sleep(TRANSACTION_BATCH_INTERVAL_MS);
  }
  return results.flat();
}

async function getAnsemPrice() {
  const url = `https://api.dexscreener.com/tokens/v1/solana/${ANSEM_MINT}`;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const pairs = await response.json();
    if (!Array.isArray(pairs)) return null;
    const best = pairs
      .filter((pair) => pair.chainId === 'solana'
        && pair.baseToken?.address === ANSEM_MINT
        && Number(pair.priceUsd) > 0)
      .sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0))[0];
    return best ? Number(best.priceUsd) : null;
  } catch {
    return null;
  }
}

export async function runRewardsCheck(wallet, apiKey, scanOptions = {}) {
  const telemetry = { heliusHttpRequests: 0, rpcMethods: 0, retryCount: 0, unparsedTransactions: [] };
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`;
  const [{ signatures, scanLimitReached }, priceUsd] = await Promise.all([
    getSignatures(rpcUrl, wallet, telemetry, scanOptions),
    getAnsemPrice(),
  ]);
  // Free-tier archival methods share the 10 RPS allowance. Leave the current
  // rate window before starting transaction batches.
  await sleep(1100);
  const transactions = await mapBatches(rpcUrl, signatures, telemetry);
  const distributions = [];
  transactions.forEach((transaction, index) => {
    if (!transaction) return;
    const amount = classifyRewardTransaction(transaction, wallet);
    if (amount === null) {
      if (findDistributionInstruction(transaction) >= 0) {
        telemetry.unparsedTransactions.push({
          signature: signatures[index].signature,
          reason: 'NOIZ distribution found, but no recipient transfer could be proven for this wallet.',
        });
      }
      return;
    }
    distributions.push({
      amount,
      timestamp: transaction.blockTime ?? signatures[index]?.blockTime ?? null,
      signature: signatures[index].signature,
    });
  });
  distributions.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  const rewardRawTotal = distributions.reduce(
    (total, reward) => total + BigInt(Math.round(reward.amount * 1_000_000)),
    0n,
  );
  const ansemRewards = Number(rewardRawTotal) / 1_000_000;
  return {
    wallet,
    ansemRewards,
    distributionCount: distributions.length,
    lastReward: distributions[0] ?? null,
    transactions: distributions,
    ansemPriceUsd: priceUsd,
    currentValueUsd: priceUsd === null ? null : ansemRewards * priceUsd,
    priceStatus: priceUsd === null ? 'unavailable' : 'available',
    scanLimitReached,
    scannedSignatures: signatures.length,
    heliusHttpRequests: telemetry.heliusHttpRequests,
    rpcMethods: telemetry.rpcMethods,
    retryCount: telemetry.retryCount,
    unparsedTransactionCount: telemetry.unparsedTransactions.length,
    unparsedTransactions: telemetry.unparsedTransactions,
  };
}

async function handleRewards(request, env) {
  if (request.method !== 'GET') {
    return json({ error: 'METHOD_NOT_ALLOWED', message: 'Use GET /api/rewards?wallet=<SOLANA_ADDRESS>.' }, 405, { allow: 'GET' });
  }
  const url = new URL(request.url);
  const wallet = (url.searchParams.get('wallet') ?? '').trim();
  if (!isValidSolanaAddress(wallet)) {
    return json({ error: 'INVALID_WALLET', message: 'Enter a valid Solana wallet address.' }, 400, { 'cache-control': 'no-store' });
  }
  if (!env.HELIUS_API_KEY) {
    return json({ error: 'SERVICE_UNAVAILABLE', message: 'Rewards service is temporarily unavailable.' }, 503, { 'cache-control': 'no-store' });
  }

  const normalizedUrl = new URL(url.origin + url.pathname);
  normalizedUrl.searchParams.set('wallet', wallet);
  const cacheKey = new Request(normalizedUrl, { method: 'GET' });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached;

  try {
    const result = await runRewardsCheck(wallet, env.HELIUS_API_KEY);
    const status = result.scanLimitReached ? 206 : 200;
    const response = json(result, status, {
      'cache-control': `public, max-age=60, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60`,
    });
    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    if (error instanceof RpcError) {
      return json({ error: 'HELIUS_UNAVAILABLE', message: 'The Solana history service is temporarily unavailable. Try again shortly.' }, 502, { 'cache-control': 'no-store' });
    }
    console.error('Rewards checker failed', error);
    return json({ error: 'INTERNAL_ERROR', message: 'Unable to check rewards right now.' }, 500, { 'cache-control': 'no-store' });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/rewards') return handleRewards(request, env);
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'NOT_FOUND', message: 'API route not found.' }, 404, { 'cache-control': 'no-store' });
    }
    return env.ASSETS.fetch(request);
  },
};
