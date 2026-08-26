// Proof for #1361 step 1: `node --test` discovers and runs this `.mts` suite,
// importing a typed `.mts` module through Node 24 native type stripping.
import assert from 'node:assert/strict';
import test from 'node:test';

import { double } from './node-24-type-stripping-lib.mts';

test('type-stripped import doubles', () => {
	assert.equal(double(21), 42);
});
