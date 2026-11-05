// Proof for #1361 step 1: Node 24 native type stripping runs this repo's
// planned `.ts` layout with bare `node` (no tsx, no build step).
// Run: node tools/ci/node-24-type-stripping.ts
// Proof test: node --test tools/ci/node-24-type-stripping.test.ts
import assert from 'node:assert/strict';

interface Answer {
	value: number;
}
const double = (n: number): number => n * 2;
const result: Answer = { value: double(21) };
assert.equal(result.value, 42);
console.log(`node type-stripping OK on ${process.version}: answer=42`);
