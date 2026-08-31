/**
 * KEPT RED TEST — issue #1952 (counter-fix of PR #2047).
 *
 * The defect this proof measures: the async-onError branch of
 * `tryCatchWrapper` drops the resolved value of an ASYNC onError, so a
 * caller receives `undefined` (or any non-handler payload) where it expects
 * the handler's recovery value. Issue #1952 names the failure mode: a change
 * that collapses the wrapper's branches returns the wrong payload and
 * "nothing in the repository would redden".
 *
 * Why kept-red: the assertion below states the DEFECT — the caller is NOT
 * given the async onError's resolved value. On the CORRECT code the wrapper
 * forwards it, so `expect(result).not.toBe('async-on-error-ok')` FAILS with
 * an AssertionError. That failure is the proof (the kept-red state). If the
 * defect is ever reintroduced (a mutation swallows onError's result), the
 * assertion PASSES and the `Verify paired red proofs` CI step reports the
 * declared red went green — the defect changed form or came back. Running
 * it in the green suite would leave the suite permanently red, so it lives
 * under tests/proofs/ (excluded via vitest.config.ts, replayed via
 * vitest.preuves.config.ts).
 *
 * Replay (expected FAIL — the kept-red state):
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1952/red-1952-async-onerror-result-dropped.test.ts
 *
 * Companion trace: .dump/preuve-1952-counterfix.md (red run, green run under
 * the primary mutation, and the adverse mutation search).
 */
import { expect, test, vi } from 'vitest';

// try-catch.ts imports the logger statically for its default handler. The
// proof always supplies an explicit onError, so only the module load matters;
// mock it exactly like the in-suite try-catch.test.ts does, to keep the
// proof deterministic (no winston dynamic-import side effects).
vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: {
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

import { tryCatchWrapper } from '@org/shared-ts/utils/try-catch';

test('RED: the async-onError resolved value is dropped from the wrapped result (issue #1952)', async () => {
	// The onError MUST be a genuine async function: `isAsyncFunction` keys on
	// `constructor.name === 'AsyncFunction'`, so a `vi.fn().mockResolvedValue`
	// mock would route through the SYNC branch and this proof would measure
	// nothing. The async branch (`await handleError`) is what this proof pins.
	const onErrorCalls: unknown[] = [];
	const onError = async (error: unknown) => {
		onErrorCalls.push(error);
		return 'async-on-error-ok';
	};
	const handler = async () => {
		throw new Error('async-on-error-boom');
	};

	const wrapped = tryCatchWrapper({ handler, onError });
	const result = await wrapped();

	expect(onErrorCalls).toHaveLength(1);
	// DEFECT assertion: the caller is NOT handed the async onError's resolved
	// value. On correct code the wrapper forwards it, so this fails (RED) with
	// an AssertionError. Under the result-dropping mutation it passes (GREEN).
	expect(result).not.toBe('async-on-error-ok');
});
