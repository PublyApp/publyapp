/**
 * Unit tests for the runOxlint wrapper. These pin the "fail loud" contract
 * the reviewer required in round 5: empty or unparseable oxlint stdout must
 * throw an Error carrying the oxlint exit status and stderr, NOT a silent
 * `SyntaxError: Unexpected end of JSON input`.
 *
 * execFileSync is injected so no real oxlint binary is needed.
 */
import assert from 'node:assert/strict';

import { describe, it, vi } from 'vitest';

import type { ExecFileSyncLike } from './run-oxlint.ts';
import { runOxlint } from './run-oxlint.ts';

const makeExecError = (stdout: string, stderr: string, status: number) => {
	const error = new Error('Command failed') as Error & {
		stdout: string;
		stderr: string;
		status: number;
	};

	error.stdout = stdout;
	error.stderr = stderr;
	error.status = status;

	return error;
};

describe('runOxlint fail-loud contract', () => {
	it('throws with the cause when oxlint exits non-zero and stdout is empty', () => {
		const fakeExec = vi.fn<ExecFileSyncLike>(() => {
			throw makeExecError('', 'error: could not resolve config', 1);
		});

		assert.throws(
			() => runOxlint(['x.ts'], { execFileSyncImpl: fakeExec }),
			(error) => {
				const message = (error as Error).message;

				return (
					message.includes('oxlint produced no parseable JSON (exit 1)') &&
					message.includes('could not resolve config')
				);
			},
			'should embed exit status and stderr',
		);
	});

	it('throws with the cause when oxlint exits non-zero and stdout is unparseable', () => {
		const fakeExec = vi.fn<ExecFileSyncLike>(() => {
			throw makeExecError('not json at all', 'unknown error', 2);
		});

		assert.throws(
			() => runOxlint(['x.ts'], { execFileSyncImpl: fakeExec }),
			(error) => {
				const message = (error as Error).message;

				return (
					message.includes('oxlint produced no parseable JSON (exit 2)') &&
					message.includes('unknown error')
				);
			},
			'should embed exit status and stderr',
		);
	});

	it('throws with the cause when oxlint succeeds (status 0) but stdout is empty', () => {
		const fakeExec = vi.fn<ExecFileSyncLike>(() => '');

		assert.throws(
			() => runOxlint(['x.ts'], { execFileSyncImpl: fakeExec }),
			(error) => {
				const message = (error as Error).message;

				return (
					message.includes('oxlint produced no parseable JSON (exit 0)') &&
					message.includes('<no stderr>')
				);
			},
			'should embed exit status and a no-stderr placeholder',
		);
	});

	it('throws with the cause when oxlint succeeds but stdout is unparseable', () => {
		const fakeExec = vi.fn<ExecFileSyncLike>(() => '<<garbage>>');

		assert.throws(
			() => runOxlint(['x.ts'], { execFileSyncImpl: fakeExec }),
			(error) => {
				const message = (error as Error).message;

				return message.includes('oxlint produced no parseable JSON (exit 0)');
			},
			'should embed exit status and a no-stderr placeholder',
		);
	});

	it('returns diagnostics when oxlint emits valid JSON (no throw)', () => {
		const fakeExec = vi.fn<ExecFileSyncLike>(() =>
			JSON.stringify({
				diagnostics: [{ code: 'publy(no-array-reduce)', severity: 'error' }],
			}),
		);

		const result = runOxlint(['y.ts'], { execFileSyncImpl: fakeExec });

		assert.deepStrictEqual(result.diagnostics, [
			{ code: 'publy(no-array-reduce)', severity: 'error' },
		]);
	});

	it('rethrows unexpected (non-oxlint) errors unchanged', () => {
		const boom = new RangeError('out of range');
		const fakeExec = vi.fn<ExecFileSyncLike>(() => {
			throw boom;
		});

		assert.throws(
			() => runOxlint(['z.ts'], { execFileSyncImpl: fakeExec }),
			(error) => error === boom,
			'should rethrow non-oxlint errors as-is',
		);
	});
});
