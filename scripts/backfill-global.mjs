import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const SOURCE_ACCOUNT = 'BusbejBxcb74pQ5uDfTzNgN2vmcqAMPh4q7tkZaUEnMb';
const EXPECTED_AUTHORITY = '5ebAXUTU7rnenM5KxCCaTVELA89EQdFy5wrp3trduTji';
const NOIZ_MINT = 'Adgt7dseCq71eN6GDuoUgpsNQp81ZNhq24nrF7pxpump';
const ANSEM_MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const DISTRIBUTE_DISCRIMINATOR = '623691610246ad2b';
const KNOWN_WALLET = '6iLYbroGEJTvnHzXTxxL1krKKP4HakE4h1mqopxsnjWU';
const EXPECTED_WALLET_RAW = 1_336_267_020n;
const EXPECTED_WALLET_COUNT = 2056;
const KNOWN_JUPITER = '2PXbbPd95GoT6A9oFMBVtuvXewQjJL6eCWFRABLCe71ssiH6gr7FCnN1UXjWkZYF2wS54sSYQ9DLxBNLcJ754Znb';
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const OUTPUT_DIRECTORY = 'artifacts/noiz-rewards';
const SIGNATURES_PATH = `${OUTPUT_DIRECTORY}/source-signatures.json`;
const CHECKPOINT_PATH = `${OUTPUT_DIRECTORY}/backfill-checkpoint.json`;
const CHECKPOINT_TEMP_PATH = `${OUTPUT_DIRECTORY}/backfill-checkpoint.tmp.json`;
const INDEX_PATH = `${OUTPUT_DIRECTORY}/index.json`;
const METADATA_PATH = `${OUTPUT_DIRECTORY}/metadata.json`;
const TOP_TEN_PATH = `${OUTPUT_DIRECTORY}/top-10.json`;
const BATCH_SIZE = 5;
const BATCH_INTERVAL_MS = 1200;
const MAX_RETRIES = 5;
const CREDIT_STOP_LIMIT = 200_000;
const CHECKPOINT_EVERY_BATCHES = 50;

if (!process.env.HELIUS_API_KEY) throw new Error('HELIUS_API_KEY is missing from .dev.vars.');
const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`;
const startedAt = performance.now();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const telemetry = {
  heliusHttpRequests: 0,
  rpcMethodAttempts: 0,
  getSignaturesForAddressCalls: 0,
  getTransactionCalls: 0,
  retries: 0,
};

function decodeBase58(value) {
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

function decodeTransferChecked(data) {
  const bytes = decodeBase58(data);
  if (!bytes || bytes.length < 10 || bytes[0] !== 12) return null;
  let rawAmount = 0n;
  for (let index = 0; index < 8; index += 1) {
    rawAmount |= BigInt(bytes[index + 1]) << BigInt(index * 8);
  }
  return { rawAmount, decimals: bytes[9] };
}

function rawToUi(rawValue) {
  const raw = BigInt(rawValue);
  const whole = raw / 1_000_000n;
  const fraction = (raw % 1_000_000n).toString().padStart(6, '0');
  return `${whole}.${fraction}`;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return Math.min(30_000, 1000 * (2 ** attempt));
}

function assertCreditBudget(nextMethodCount) {
  const projected = (telemetry.rpcMethodAttempts + nextMethodCount) * 10;
  if (projected >= CREDIT_STOP_LIMIT) {
    throw new Error(`STOP_CREDIT_LIMIT: projected attempted usage ${projected} credits.`);
  }
}

async function postRpc(body, methodCount) {
  let response;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    assertCreditBudget(methodCount);
    telemetry.heliusHttpRequests += 1;
    telemetry.rpcMethodAttempts += methodCount;
    response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (![429, 503].includes(response.status) || attempt === MAX_RETRIES) break;
    telemetry.retries += 1;
    await sleep(retryDelay(response, attempt));
  }
  if (!response.ok) throw new Error(`Helius returned HTTP ${response.status}.`);
  return response.json();
}

async function atomicJson(path, temporaryPath, value, compact = false) {
  const json = compact ? JSON.stringify(value) : JSON.stringify(value, null, 2);
  await writeFile(temporaryPath, json, 'utf8');
  await rename(temporaryPath, path);
}

async function loadJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function discoverSignatures() {
  const cached = await loadJson(SIGNATURES_PATH);
  if (cached?.source === SOURCE_ACCOUNT && Array.isArray(cached.signatures)) {
    console.log(`Reusing ${cached.signatures.length} cached source signatures.`);
    return cached;
  }

  const signatures = [];
  let before;
  let pageNumber = 0;
  while (true) {
    const options = { limit: 1000, commitment: 'finalized' };
    if (before) options.before = before;
    telemetry.getSignaturesForAddressCalls += 1;
    const payload = await postRpc({
      jsonrpc: '2.0', id: pageNumber + 1, method: 'getSignaturesForAddress', params: [SOURCE_ACCOUNT, options],
    }, 1);
    if (payload.error) throw new Error(payload.error.message);
    const page = payload.result;
    signatures.push(...page);
    pageNumber += 1;
    console.log(`Signature discovery: page ${pageNumber}, total ${signatures.length}.`);
    if (page.length < 1000) break;
    before = page.at(-1).signature;
  }

  const result = {
    source: SOURCE_ACCOUNT,
    captured_at: new Date().toISOString(),
    newest_signature: signatures[0]?.signature ?? null,
    newest_at: signatures[0]?.blockTime ?? null,
    total: signatures.length,
    successful: signatures.filter((entry) => !entry.err).length,
    failed: signatures.filter((entry) => entry.err).length,
    signatures,
  };
  await writeFile(SIGNATURES_PATH, JSON.stringify(result), 'utf8');
  return result;
}

function transactionKeys(transaction) {
  const staticKeys = (transaction.transaction?.message?.accountKeys ?? [])
    .map((key) => (typeof key === 'string' ? key : key.pubkey));
  const loaded = transaction.meta?.loadedAddresses ?? {};
  return [...staticKeys, ...(loaded.writable ?? []), ...(loaded.readonly ?? [])];
}

function parseDistribution(transaction, signature) {
  if (!transaction || transaction.meta?.err) return null;
  const keys = transactionKeys(transaction);
  const instructions = transaction.transaction?.message?.instructions ?? [];
  const instructionIndex = instructions.findIndex((instruction) => {
    const accounts = instruction.accounts ?? [];
    return keys[instruction.programIdIndex] === PUMP_PROGRAM
      && hexPrefix(instruction.data, 8) === DISTRIBUTE_DISCRIMINATOR
      && keys[accounts[2]] === NOIZ_MINT
      && keys[accounts[5]] === ANSEM_MINT;
  });
  if (instructionIndex < 0) return null;
  if (!(transaction.meta?.logMessages ?? []).some((line) => line.includes('Instruction: DistributeFeeToHolders'))) {
    throw new Error(`STOP_PATTERN: ${signature} has the discriminator but not the expected instruction log.`);
  }

  const parent = instructions[instructionIndex];
  const source = keys[parent.accounts[4]];
  const authority = keys[parent.accounts[3]];
  if (source !== SOURCE_ACCOUNT || authority !== EXPECTED_AUTHORITY) {
    throw new Error(`STOP_SOURCE_ROTATION: ${signature} uses source ${source} and authority ${authority}.`);
  }

  const owners = new Map();
  for (const balance of [...(transaction.meta.preTokenBalances ?? []), ...(transaction.meta.postTokenBalances ?? [])]) {
    if (balance.mint === ANSEM_MINT && balance.owner) owners.set(keys[balance.accountIndex], balance.owner);
  }

  const inner = (transaction.meta.innerInstructions ?? [])
    .find((group) => group.index === instructionIndex)?.instructions ?? [];
  const transfers = [];
  for (const instruction of inner) {
    if (keys[instruction.programIdIndex] !== TOKEN_2022_PROGRAM) continue;
    const transfer = decodeTransferChecked(instruction.data);
    if (!transfer) continue;
    const transferSource = keys[instruction.accounts[0]];
    const mint = keys[instruction.accounts[1]];
    const destination = keys[instruction.accounts[2]];
    const transferAuthority = keys[instruction.accounts[3]];
    if (mint !== ANSEM_MINT || transferSource !== source || transferAuthority !== authority) continue;
    if (transfer.decimals !== 6) throw new Error(`STOP_PATTERN: ${signature} uses ${transfer.decimals} ANSEM decimals.`);
    const wallet = owners.get(destination);
    if (!wallet) throw new Error(`STOP_OWNER_RESOLUTION: ${signature} cannot resolve ${destination}.`);
    transfers.push({ wallet, destination, rawAmount: transfer.rawAmount });
  }
  if (transfers.length === 0) throw new Error(`STOP_PATTERN: ${signature} has no qualifying holder transfers.`);
  return { signature, timestamp: transaction.blockTime, source, authority, transfers };
}

function emptyState() {
  return {
    nextIndex: 0,
    qualifyingDistributions: 0,
    holderTransfers: 0,
    firstDistribution: null,
    lastDistribution: null,
    sourceAccountCounts: {},
    authorityCounts: {},
    wallets: {},
    unparsedTransactions: [],
  };
}

function applyDistribution(state, distribution) {
  state.qualifyingDistributions += 1;
  state.holderTransfers += distribution.transfers.length;
  state.sourceAccountCounts[distribution.source] = (state.sourceAccountCounts[distribution.source] ?? 0) + 1;
  state.authorityCounts[distribution.authority] = (state.authorityCounts[distribution.authority] ?? 0) + 1;
  const point = { signature: distribution.signature, timestamp: distribution.timestamp };
  if (!state.firstDistribution || distribution.timestamp < state.firstDistribution.timestamp) state.firstDistribution = point;
  if (!state.lastDistribution || distribution.timestamp > state.lastDistribution.timestamp) state.lastDistribution = point;

  const byWallet = new Map();
  for (const transfer of distribution.transfers) {
    byWallet.set(transfer.wallet, (byWallet.get(transfer.wallet) ?? 0n) + transfer.rawAmount);
  }
  for (const [wallet, rawAmount] of byWallet) {
    const current = state.wallets[wallet] ?? {
      total_ansem_raw: '0', reward_count: 0, first_reward_at: distribution.timestamp,
      last_reward_at: distribution.timestamp, last_signature: distribution.signature,
    };
    current.total_ansem_raw = (BigInt(current.total_ansem_raw) + rawAmount).toString();
    current.reward_count += 1;
    current.first_reward_at = Math.min(current.first_reward_at, distribution.timestamp);
    if (distribution.timestamp >= current.last_reward_at) {
      current.last_reward_at = distribution.timestamp;
      current.last_signature = distribution.signature;
    }
    state.wallets[wallet] = current;
  }
}

async function saveCheckpoint(state, signatureSnapshot) {
  await atomicJson(CHECKPOINT_PATH, CHECKPOINT_TEMP_PATH, {
    source: SOURCE_ACCOUNT,
    snapshot_newest_signature: signatureSnapshot.newest_signature,
    saved_at: new Date().toISOString(),
    telemetry,
    state,
  }, true);
}

async function fetchTransactionBatch(entries, idOffset) {
  telemetry.getTransactionCalls += entries.length;
  const requests = entries.map((entry, index) => ({
    jsonrpc: '2.0', id: idOffset + index, method: 'getTransaction',
    params: [entry.signature, { encoding: 'json', commitment: 'finalized', maxSupportedTransactionVersion: 0 }],
  }));
  const payload = await postRpc(requests, requests.length);
  if (!Array.isArray(payload)) throw new Error('Unexpected Helius transaction batch response.');
  const byId = new Map(payload.map((item) => [item.id, item]));
  return requests.map((request, index) => {
    const item = byId.get(request.id);
    if (item?.error || !item?.result) {
      throw new Error(`STOP_UNPARSED: ${entries[index].signature}: ${item?.error?.message ?? 'transaction unavailable'}`);
    }
    return item.result;
  });
}

async function simulateIncremental(cursor) {
  telemetry.getSignaturesForAddressCalls += 1;
  const payload = await postRpc({
    jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress',
    params: [SOURCE_ACCOUNT, { limit: 1000, until: cursor, commitment: 'finalized' }],
  }, 1);
  if (payload.error) throw new Error(payload.error.message);
  return payload.result;
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const signatureSnapshot = await discoverSignatures();
const successfulSignatures = signatureSnapshot.signatures.filter((entry) => !entry.err);
const minimumProjectedCredits = (
  telemetry.rpcMethodAttempts + successfulSignatures.length + 1
) * 10;
console.log(`Source snapshot: ${signatureSnapshot.total} signatures (${successfulSignatures.length} successful, ${signatureSnapshot.failed} failed).`);
console.log(`Projected minimum usage: ${minimumProjectedCredits} credits.`);
if (minimumProjectedCredits >= CREDIT_STOP_LIMIT) {
  throw new Error(`STOP_CREDIT_LIMIT: source history projects ${minimumProjectedCredits} credits.`);
}

const storedCheckpoint = await loadJson(CHECKPOINT_PATH);
let state = emptyState();
if (storedCheckpoint) {
  if (storedCheckpoint.snapshot_newest_signature !== signatureSnapshot.newest_signature) {
    throw new Error('Checkpoint belongs to a different source snapshot; refusing unsafe resume.');
  }
  state = storedCheckpoint.state;
  Object.assign(telemetry, storedCheckpoint.telemetry);
  console.log(`Resuming checkpoint at transaction ${state.nextIndex}/${successfulSignatures.length}.`);
}

let batchNumber = Math.floor(state.nextIndex / BATCH_SIZE);
for (let index = state.nextIndex; index < successfulSignatures.length; index += BATCH_SIZE) {
  const entries = successfulSignatures.slice(index, index + BATCH_SIZE);
  const transactions = await fetchTransactionBatch(entries, index + 1);
  for (let offset = 0; offset < transactions.length; offset += 1) {
    const distribution = parseDistribution(transactions[offset], entries[offset].signature);
    if (distribution) applyDistribution(state, distribution);
  }
  state.nextIndex = index + entries.length;
  batchNumber += 1;
  if (batchNumber % CHECKPOINT_EVERY_BATCHES === 0 || state.nextIndex === successfulSignatures.length) {
    await saveCheckpoint(state, signatureSnapshot);
    const elapsedSeconds = Math.round((performance.now() - startedAt) / 1000);
    console.log(`Backfill: ${state.nextIndex}/${successfulSignatures.length}; distributions ${state.qualifyingDistributions}; recipients ${Object.keys(state.wallets).length}; ${elapsedSeconds}s.`);
  }
  if (state.nextIndex < successfulSignatures.length) await sleep(BATCH_INTERVAL_MS);
}

const known = state.wallets[KNOWN_WALLET];
if (!known || BigInt(known.total_ansem_raw) !== EXPECTED_WALLET_RAW || known.reward_count !== EXPECTED_WALLET_COUNT) {
  throw new Error(`STOP_VALIDATION: known wallet returned ${known?.total_ansem_raw ?? 'missing'} raw and ${known?.reward_count ?? 0} distributions; expected ${EXPECTED_WALLET_RAW} and ${EXPECTED_WALLET_COUNT}.`);
}
if (signatureSnapshot.signatures.some((entry) => entry.signature === KNOWN_JUPITER)) {
  throw new Error('STOP_FALSE_POSITIVE: Jupiter purchase unexpectedly appears in the source-account history.');
}

const wallets = Object.entries(state.wallets).map(([wallet, record]) => ({
  wallet,
  total_ansem_raw: record.total_ansem_raw,
  total_ansem_ui: rawToUi(record.total_ansem_raw),
  reward_count: record.reward_count,
  first_reward_at: record.first_reward_at,
  last_reward_at: record.last_reward_at,
  last_signature: record.last_signature,
})).sort((a, b) => a.wallet.localeCompare(b.wallet));

const topTen = [...wallets].sort((a, b) => {
  const difference = BigInt(b.total_ansem_raw) - BigInt(a.total_ansem_raw);
  return difference > 0n ? 1 : difference < 0n ? -1 : 0;
}).slice(0, 10).map(({ wallet, total_ansem_ui, reward_count, last_reward_at, last_signature }) => ({
  wallet, total_ansem: total_ansem_ui, reward_count, last_reward_at, last_signature,
}));

const incremental = await simulateIncremental(signatureSnapshot.newest_signature);
const metadata = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source_account: SOURCE_ACCOUNT,
  last_indexed_signature: signatureSnapshot.newest_signature,
  last_indexed_at: signatureSnapshot.newest_at,
  total_source_signatures_examined: signatureSnapshot.total,
  successful_source_signatures: successfulSignatures.length,
  failed_source_signatures: signatureSnapshot.failed,
  total_qualifying_distribution_transactions: state.qualifyingDistributions,
  total_holder_transfers: state.holderTransfers,
  unique_recipient_wallets: wallets.length,
  first_distribution_signature: state.firstDistribution.signature,
  first_distribution_at: state.firstDistribution.timestamp,
  last_distribution_signature: state.lastDistribution.signature,
  last_distribution_at: state.lastDistribution.timestamp,
  source_account_counts: state.sourceAccountCounts,
  authority_counts: state.authorityCounts,
  known_wallet_validation: {
    wallet: KNOWN_WALLET, total_ansem_raw: known.total_ansem_raw,
    total_ansem_ui: rawToUi(known.total_ansem_raw), reward_count: known.reward_count, passed: true,
  },
  known_jupiter_purchase_included: false,
  incremental_simulation: {
    cursor: signatureSnapshot.newest_signature,
    newer_signatures_found: incremental.length,
    only_newer_than_cursor: incremental.every((entry) => entry.blockTime >= signatureSnapshot.newest_at),
  },
  helius_usage: {
    getSignaturesForAddress_calls: telemetry.getSignaturesForAddressCalls,
    getTransaction_calls: telemetry.getTransactionCalls,
    retries: telemetry.retries,
    http_requests: telemetry.heliusHttpRequests,
    rpc_method_attempts: telemetry.rpcMethodAttempts,
    estimated_logical_credits: (telemetry.getSignaturesForAddressCalls + telemetry.getTransactionCalls) * 10,
    conservative_attempted_credits: telemetry.rpcMethodAttempts * 10,
  },
  execution_time_ms: Math.round(performance.now() - startedAt),
};

await writeFile(INDEX_PATH, JSON.stringify({ metadata, wallets }), 'utf8');
await writeFile(METADATA_PATH, JSON.stringify(metadata, null, 2), 'utf8');
await writeFile(TOP_TEN_PATH, JSON.stringify(topTen, null, 2), 'utf8');
const indexStats = await stat(INDEX_PATH);
metadata.index_size_bytes = indexStats.size;
await writeFile(METADATA_PATH, JSON.stringify(metadata, null, 2), 'utf8');
try { await unlink(CHECKPOINT_PATH); } catch (error) { if (error.code !== 'ENOENT') throw error; }

console.log(JSON.stringify({ metadata, topTen, indexPath: INDEX_PATH }, null, 2));
