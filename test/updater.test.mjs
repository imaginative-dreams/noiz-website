import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ANSEM_WALLET,
  DAILY_CREDIT_LIMIT,
  EXPECTED_DAILY_RPC_CALLS,
  WEEKLY_CREDIT_LIMIT,
  buildWeeklyDataset,
  createRpcClient,
  createTelemetry,
  holderEligibility,
  isOnCurve,
  isValidSignature,
  migrateHistory,
  pendingState,
  refreshCurrentPositions,
  signaturesAfterCursor,
} from '../scripts/update-holder-rewards.mjs';

const NORMAL_WALLET = '6iLYbroGEJTvnHzXTxxL1krKKP4HakE4h1mqopxsnjWU';
const VALID_CURSOR = '3s3DzBLJjG87xUzMxvTRDuXs2opz65xY5YqcjixBCrSU8SBPe6pgF3Gci9m6ezmhA3eZkyXL1B927j2CXrk9ocwQ';

test('incremental signatures use a valid saved cursor and never request older history', async () => {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    return [{ signature: 'newest', err: null, blockTime: 1_800_000_000 }];
  };
  const result = await signaturesAfterCursor(rpc, NORMAL_WALLET, VALID_CURSOR, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[1].until, VALID_CURSOR);
  assert.deepEqual(result.entries.map((entry) => entry.signature), ['newest']);
  assert.equal(result.newestSignature, 'newest');
});

test('legacy records use rewardsUpdatedAt as a bounded timestamp cursor', async () => {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    return [
      { signature: 'newer', err: null, blockTime: 200 },
      { signature: 'at-snapshot', err: null, blockTime: 100 },
      { signature: 'older', err: null, blockTime: 99 },
    ];
  };
  const result = await signaturesAfterCursor(rpc, NORMAL_WALLET, null, new Date(100_000).toISOString());
  assert.equal(calls[0].params[1].until, undefined);
  assert.deepEqual(result.entries.map((entry) => entry.signature), ['newer']);
  assert.equal(result.cursorMode, 'timestamp');
});

test('daily current-state discovery uses exactly five RPC calls', async () => {
  const wallets = [
    '2nKeNVKDFsj6zGsU1DzgxRzXPKhxxFvCDhA9d5V3wT21',
    '7mhFPm6SSXu3VM9spvERxTt6nbLVZAnGFgUVLTMvt3Kn',
    ANSEM_WALLET,
    'CdtTxJo1mGicuN9cF8u4XTrXHeHCz5Hc9QquSnMUxsCq',
    'BieeZkdnBAgNYknzo3RH2vku7FcPkFZMZmRJANh2TpW',
  ];
  const tokenAccounts = wallets.map((_, index) => `token-${index}`);
  const amounts = ['50000000', '40000000', '30000000', '20000000', '10000000'];
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === 'getTokenLargestAccounts') return { value: tokenAccounts.map((address) => ({ address })) };
    if (method === 'getTokenSupply') return { value: { amount: '1000000000', decimals: 0 } };
    if (method === 'getTokenAccountsByOwner') {
      return { value: [{ pubkey: tokenAccounts[2], account: { data: { parsed: { info: { tokenAmount: { amount: amounts[2] } } } } } }] };
    }
    if (params[1]?.encoding === 'jsonParsed') {
      return { value: wallets.map((wallet, index) => ({ data: { parsed: { info: {
        mint: 'Adgt7dseCq71eN6GDuoUgpsNQp81ZNhq24nrF7pxpump',
        owner: wallet,
        tokenAmount: { amount: amounts[index] },
      } } } })) };
    }
    return { value: wallets.map(() => null) };
  };
  const result = await refreshCurrentPositions(rpc);
  assert.equal(calls.length, EXPECTED_DAILY_RPC_CALLS);
  assert.equal(result.holders.length, 5);
  assert.equal(result.ansemPosition.noizBalance, 30_000_000);
  assert.deepEqual(new Set(calls.map((call) => call.method)), new Set([
    'getTokenLargestAccounts', 'getTokenSupply', 'getMultipleAccounts', 'getTokenAccountsByOwner',
  ]));
});

test('a new holder is pending and never receives a false zero', () => {
  const pending = pendingState(NORMAL_WALLET);
  assert.equal(pending.rewardStatus, 'pending');
  assert.equal(pending.ansemEarned, null);
  assert.equal(pending.rewardCount, null);
  assert.match(pending.pendingReason, /manual initialization/i);
});

test('Ansem remains an explicit verified holder exception before infrastructure filtering', () => {
  assert.equal(isOnCurve(NORMAL_WALLET), true);
  assert.deepEqual(holderEligibility(ANSEM_WALLET, { executable: true, owner: 'ProgramOwned111111111111111111111111111111' }), {
    eligible: true,
    reason: 'verified Ansem-controlled address',
  });
});

test('dataset migration preserves confirmed totals but does not trust legacy reward signatures as cursors', () => {
  const dataset = JSON.parse(fs.readFileSync(new URL('../public/data/noiz-holder-rewards.json', import.meta.url), 'utf8'));
  const history = migrateHistory(dataset);
  const expectedWallets = new Set([
    ...Object.keys(dataset.holderHistory ?? {}),
    ...dataset.holders.map((holder) => holder.wallet),
    dataset.ansem.wallet,
  ]);
  assert.deepEqual(new Set(Object.keys(history)), expectedWallets);
  for (const holder of dataset.holders) assert.ok(history[holder.wallet]);
  for (const wallet of Object.keys(dataset.holderHistory ?? {})) assert.ok(history[wallet]);
  assert.ok(history[ANSEM_WALLET]);
  assert.equal(history[ANSEM_WALLET].ansemEarnedRaw, '25703560764');
  assert.equal(history[ANSEM_WALLET].rewardCursorSignature, null);
  assert.equal(history[ANSEM_WALLET].rewardingSince, dataset.ansem.rewardingSince);
});

test('the daily guardrail is tiny and enforced before sending another request', async () => {
  assert.equal(DAILY_CREDIT_LIMIT, 200);
  const telemetry = createTelemetry(15);
  let fetchCalls = 0;
  const rpc = createRpcClient('local-test-key', telemetry, async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: [] }), { status: 200 });
  });
  await rpc('getTokenLargestAccounts', []);
  await assert.rejects(() => rpc('getTokenSupply', []), /Helius ceiling/);
  assert.equal(fetchCalls, 1);
});

test('weekly budget insufficiency preserves the entire confirmed dataset without transaction calls', async () => {
  assert.equal(WEEKLY_CREDIT_LIMIT, 20_000);
  const dataset = JSON.parse(fs.readFileSync(new URL('../public/data/noiz-holder-rewards.json', import.meta.url), 'utf8'));
  const methods = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    methods.push(request.method);
    const result = Array.from({ length: 2_000 }, (_, index) => ({
      signature: `signature-${index}`,
      err: null,
      blockTime: 1_800_000_000 - index,
    }));
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
  };
  const result = await buildWeeklyDataset({ dataset, apiKey: 'local-test-key', fetchImpl });
  assert.equal(result.completed, false);
  assert.equal(result.dataset, dataset);
  assert.equal(result.report.status, 'preserved-budget-insufficient');
  assert.deepEqual(methods, ['getSignaturesForAddress']);
});

test('daily and weekly workflows are schedule/manual only and commit only the dataset', () => {
  const daily = fs.readFileSync(new URL('../.github/workflows/update-holder-rewards.yml', import.meta.url), 'utf8');
  const weekly = fs.readFileSync(new URL('../.github/workflows/update-holder-rewards-weekly.yml', import.meta.url), 'utf8');
  assert.match(daily, /cron: '17 04 \* \* \*'/);
  assert.match(daily, /--mode=daily/);
  assert.match(weekly, /cron: '17 05 \* \* 0'/);
  assert.match(weekly, /--mode=weekly/);
  for (const workflow of [daily, weekly]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /^\s*push:/m);
    assert.match(workflow, /git add -- public\/data\/noiz-holder-rewards\.json/);
  }
});

test('the UI distinguishes pending rewards and labels the independent reward timestamp', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /rewardStatus/);
  assert.match(html, /MANUAL REVIEW/);
  assert.match(html, /REWARD HISTORY PENDING/);
  assert.match(html, /data\.rewardsUpdatedAt\|\|data\.datasetUpdatedAt/);
  assert.match(html, /HOLDER REWARDS SNAPSHOT UPDATED/);
});

test('Solana signature validation remains strict', () => {
  assert.equal(isValidSignature(VALID_CURSOR), true);
  assert.equal(isValidSignature('not-a-signature'), false);
});
