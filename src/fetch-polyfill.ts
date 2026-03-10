/**
 * @file src/fetch-polyfill.ts
 * @description Global fetch dispatcher patch for Firebase Cloud Functions.
 *
 * Problem: Node 18+ uses `undici` internally for the global `fetch()`.
 * Undici defaults to trying IPv6 first, which causes `ETIMEDOUT` errors
 * when connecting to api.telegram.org (and other services) from Google Cloud,
 * because Cloud Run containers often have broken IPv6 routing.
 *
 * Solution: Force undici to always resolve hostnames using IPv4 (family: 4).
 * This file must be imported BEFORE any network calls are made — hence the
 * first import in `src/index.ts`.
 */

import { setGlobalDispatcher, Agent } from 'undici';
import dns from 'dns';

// Patch the global fetch dispatcher to use IPv4-only DNS resolution.
setGlobalDispatcher(
  new Agent({
    connect: {
      lookup: (hostname, _options, cb) =>
        dns.lookup(hostname, { family: 4 }, cb),
    },
  })
);