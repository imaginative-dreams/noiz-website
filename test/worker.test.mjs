import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRewardTransaction, isValidSolanaAddress } from '../worker.mjs';

const WALLET = '6iLYbroGEJTvnHzXTxxL1krKKP4HakE4h1mqopxsnjWU';
const POSITIVE_SIGNATURE = '3s3DzBLJjG87xUzMxvTRDuXs2opz65xY5YqcjixBCrSU8SBPe6pgF3Gci9m6ezmhA3eZkyXL1B927j2CXrk9ocwQ';
const NEGATIVE_SIGNATURE = '2PXbbPd95GoT6A9oFMBVtuvXewQjJL6eCWFRABLCe71ssiH6gr7FCnN1UXjWkZYF2wS54sSYQ9DLxBNLcJ754Znb';

// Minimal lossless slice of the known mainnet transaction. Account ordering,
// instruction bytes and TransferChecked bytes are copied from Solana RPC.
function positiveTransaction() {
  const accountKeys = [
    'HckQ93Xqjjo8mwt5pNPWvyCTZXQZ858rvzmm7ZRrZg9t',
    '5ebAXUTU7rnenM5KxCCaTVELA89EQdFy5wrp3trduTji',
    'BusbejBxcb74pQ5uDfTzNgN2vmcqAMPh4q7tkZaUEnMb',
    'FK81YFxiyBTEiLpuz1UMgrTBvo5PoswBoczoxTx3KXqn',
    '21gBK5ehGUk2EeWPXSexbLCR7AFMVLfvGyK4oo5LPQt3',
    '2Yzvpf8jo9dFbcvo1y8Qe3Fz1p8rsgWuMsBcWJyuAU2h',
    '9uQUjoD6VK53KRJmrYnL69sYVKCHNcyRzuRA1tHUw1Fi',
    '9YcQg5dFniYAhxdri8gLyMQu9fLkFBj3YQDmPrTRNiKv',
    'xyLSK9NeSVuM3sKLrR6QEGLJoPwYDyTpEP1zfC9YZyq',
    '4ghcqrQQkfi4rsjNhbUXEdswEfW58dEYezUXGTYaRBVy',
    'GigNy5ttGHfHxWyu26eh3Rx67eFo2spjg2eGUthub3E6',
    'ComputeBudget111111111111111111111111111111',
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf',
    'Adgt7dseCq71eN6GDuoUgpsNQp81ZNhq24nrF7pxpump',
    '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  ];
  return {
    signature: POSITIVE_SIGNATURE,
    blockTime: 1791039431,
    transaction: { message: { accountKeys, instructions: [
      { programIdIndex: 11, accounts: [], data: 'HMypLP' },
      { programIdIndex: 11, accounts: [], data: '3GAG5eogvTjV' },
      {
        programIdIndex: 12,
        accounts: [13, 0, 14, 1, 2, 15, 16, 17, 18, 19, 12, 20, 3, 21, 4, 22, 5, 23, 6, 24, 7, 25, 8, 26, 9, 27, 10],
        data: 'AVBx29KmrDC2UpP12yLed6tqQTrry8zx5wvnWzbDrvm5JKHCMDXGnMNrS34AiwDQkoVdqF6oZLAY1CiM86B4KM3FuC9w8JidBTY8ebmh',
      },
    ] } },
    meta: {
      err: null,
      preTokenBalances: [{ accountIndex: 8, mint: accountKeys[15], owner: WALLET }],
      postTokenBalances: [{ accountIndex: 8, mint: accountKeys[15], owner: WALLET }],
      innerInstructions: [{ index: 2, instructions: [{
        accounts: [2, 15, 8, 1],
        data: 'gYMDcYcJF2SGu',
        programIdIndex: 16,
      }] }],
    },
  };
}

test(`known reward ${POSITIVE_SIGNATURE} returns exactly 0.81309 ANSEM`, () => {
  assert.equal(classifyRewardTransaction(positiveTransaction(), WALLET), 0.81309);
});

test('the distribution selects only the transfer belonging to the queried wallet', () => {
  assert.equal(
    classifyRewardTransaction(positiveTransaction(), '6eicnkjvcFQvqjmzSzx8TqLTb8bJmE6AHTqrKZcYFqdK'),
    null,
  );
});

test(`known Jupiter purchase ${NEGATIVE_SIGNATURE} is not a reward`, () => {
  const transaction = {
    signature: NEGATIVE_SIGNATURE,
    transaction: { message: { accountKeys: [
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
      '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump',
    ], instructions: [{ programIdIndex: 0, accounts: [1], data: 'RouteV2' }] } },
    meta: { err: null, preTokenBalances: [], postTokenBalances: [], innerInstructions: [] },
  };
  assert.equal(classifyRewardTransaction(transaction, WALLET), null);
});

test('a Pump instruction with the wrong quote mint is rejected', () => {
  const transaction = positiveTransaction();
  transaction.transaction.message.accountKeys[15] = 'So11111111111111111111111111111111111111112';
  assert.equal(classifyRewardTransaction(transaction, WALLET), null);
});

test('Solana address validation decodes exactly 32 bytes', () => {
  assert.equal(isValidSolanaAddress(WALLET), true);
  assert.equal(isValidSolanaAddress('not-a-wallet'), false);
  assert.equal(isValidSolanaAddress(`${WALLET}1`), false);
});

test('the endpoint rejects an invalid wallet before making external requests', async () => {
  const { default: worker } = await import('../worker.mjs');
  const response = await worker.fetch(new Request('https://makenoiz.xyz/api/rewards?wallet=nope'), {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'INVALID_WALLET');
});

test('the endpoint fails safely when the server-side secret is unavailable', async () => {
  const { default: worker } = await import('../worker.mjs');
  const response = await worker.fetch(new Request(`https://makenoiz.xyz/api/rewards?wallet=${WALLET}`), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'SERVICE_UNAVAILABLE');
});
