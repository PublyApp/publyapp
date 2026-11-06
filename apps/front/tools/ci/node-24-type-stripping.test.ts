// Proof for #1361 step 1: `node --test` discovers and runs this `.ts` suite,
// importing a typed `.ts` module through Node 24 native type stripping.
import assert from 'node:assert/strict';
import test from 'node:test';

import { double } from './node-24-type-stripping-lib.ts';

test('type-stripped import doubles', () => {
	assert.equal(double(21), 42);
});
