import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'scripts/cloudflare_dispatcher.js'), 'utf8');
const worker = (await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
)).default;

function captureFetch(status = 204) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      status,
      text: async () => (status === 204 ? '' : 'mock error'),
    };
  };
  return calls;
}

async function runScheduled(cron, env = { GH_PAT: 'test' }) {
  const waits = [];
  await worker.scheduled({ cron }, env, { waitUntil: promise => waits.push(promise) });
  await Promise.all(waits);
}

{
  const calls = captureFetch();
  await runScheduled('5 * * * *');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /Jerry114514\/Jerry114514\.github\.io\/.+fetch-data\.yml/);
  assert.deepEqual(calls[0].body, { ref: 'main' });
}

{
  const calls = captureFetch();
  await runScheduled('2,17,32,47 * * * *');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /Jerry114514\/hd2-planet-history\/.+record\.yml/);
  assert.deepEqual(calls[0].body, { ref: 'main' });
}

{
  const calls = captureFetch();
  const response = await worker.fetch(
    new Request('https://worker.example/'),
    { GH_PAT: 'test' },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.dispatched, true);
  assert.equal(body.results.length, 2);
  assert.match(body.results[0].target, /Jerry114514\.github\.io\/fetch-data\.yml/);
  assert.match(body.results[1].target, /hd2-planet-history\/record\.yml/);
  assert.equal(calls.length, 2);
}

console.log('cloudflare-dispatcher-check: all assertions passed');
