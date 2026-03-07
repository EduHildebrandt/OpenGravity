import { setGlobalDispatcher, Agent } from 'undici';
import dns from 'dns';

// Force undici (Node 18+ global fetch dispatcher) to use IPv4.
// This resolves ETIMEDOUT errors when connecting to api.telegram.org on systems with broken IPv6.
setGlobalDispatcher(new Agent({
  connect: { lookup: (hostname, options, cb) => dns.lookup(hostname, { family: 4 }, cb) }
}));