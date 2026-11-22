import { runShard } from './ci-e2e-shard.ts';

// CI entrypoint. The runner (plan consumption, project list, install, drawer
// contrast) lives in ci-e2e-shard.ts; the stack health gate is the separate
// `Wait for e2e stack health` step, run by ci-e2e-wait-health.ts.
runShard();
