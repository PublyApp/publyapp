import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	existsSync,
	linkSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
	ambientCredentialSecrets,
	collectEffectiveSecrets,
	DEFAULT_COMMAND_TIMEOUT_MS,
	getRepoRoot,
	getRootClonePath,
	getWorktrees,
	isPortAvailableOnHost,
	parseLauncherArgs,
	parseStrictPort,
	REDACTED,
	redactSecrets,
	reportNewlyDirtyFiles,
	runCommand,
	runCommandOptional,
	trackedChanges,
} from './review-launcher.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const fixturePath = path.join(scriptDir, '_review-launcher.fixture.ts');
// The shared layer resolves the TRUE root clone (via --git-common-dir), which differs
// from this worktree's root when the suite runs inside .worktrees/.
const rootClonePath = getRootClonePath();
const rootEnvFile = path.join(
	// @ts-expect-error rung-0: TS2345 - root clone path stays untyped until a later rung
	rootClonePath,
	'.env.development',
);

const sha256 = (
	// @ts-expect-error rung-0: add proper type in later rung
	filePath,
) => createHash('sha256').update(readFileSync(filePath)).digest('hex');

// Utilities that terminate via err() (console.error + process.exit(1)) are asserted
// through this real-subprocess runner, mirroring how review-api.test.ts drives the real
// CLIs — an in-process call would kill the vitest worker.
const runFixture = (
	// @ts-expect-error rung-0: add proper type in later rung
	args,
) => {
	const result = spawnSync('node', [fixturePath, ...args], {
		cwd: repoRoot,
		encoding: 'utf8',
		timeout: 30_000,
	});

	return {
		status: result.status,
		stdout: String(result.stdout ?? ''),
		stderr: String(result.stderr ?? ''),
	};
};

// A child command whose failure output embeds a credential-shaped secret, so the
// RED/GREEN pair below can prove redaction is load-bearing end to end.
const FAIL_ECHOING_SECRET =
	'console.error("connection failed: Host=db;Password=hunter2"); process.exit(7);';

const withTempDir = (
	// @ts-expect-error rung-0: add proper type in later rung
	fn,
) => {
	const dir = mkdtempSync(path.join(tmpdir(), 'review-launcher-test-'));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

// --- redactSecrets --------------------------------------------------------------

test('redactSecrets: replaces every occurrence of every secret', () => {
	assert.equal(
		redactSecrets(
			'a hunter2 b hunter2 c token d token',
			// @ts-expect-error rung-0: TS2322 - secrets stays untyped until a later rung
			['hunter2', 'token'],
		),
		`a ${REDACTED} b ${REDACTED} c ${REDACTED} d ${REDACTED}`,
	);
});

test('redactSecrets: ignores empty and nullish secrets without throwing', () => {
	assert.equal(
		redactSecrets(
			'untouched',
			// @ts-expect-error rung-0: TS2322 - secrets stays untyped until a later rung
			['', null, undefined],
		),
		'untouched',
	);
});

test('redactSecrets: leaves unrelated text alone', () => {
	assert.equal(
		redactSecrets(
			'nothing matches here',
			// @ts-expect-error rung-0: TS2322 - secrets stays untyped until a later rung
			['nope'],
		),
		'nothing matches here',
	);
});

// --- ambient credentials ----------------------------------------------------------

test('ambientCredentialSecrets: reads PGPASSWORD fresh and skips empties', () => {
	const previous = process.env.PGPASSWORD;
	try {
		process.env.PGPASSWORD = 'ambient-secret';
		assert.deepEqual(ambientCredentialSecrets(), ['ambient-secret']);

		process.env.PGPASSWORD = '';
		assert.deepEqual(ambientCredentialSecrets(), []);
	} finally {
		if (previous === undefined) {
			delete process.env.PGPASSWORD;
		} else {
			process.env.PGPASSWORD = previous;
		}
	}
});

test('collectEffectiveSecrets: merges caller-declared and ambient secrets, deduplicated', () => {
	const previous = process.env.PGPASSWORD;
	try {
		delete process.env.PGPASSWORD;
		assert.deepEqual(collectEffectiveSecrets(['a', 'b']), ['a', 'b']);

		process.env.PGPASSWORD = 'a';
		assert.deepEqual(collectEffectiveSecrets(['a', 'b']), ['a', 'b']);
	} finally {
		if (previous === undefined) {
			delete process.env.PGPASSWORD;
		} else {
			process.env.PGPASSWORD = previous;
		}
	}
});

// --- runCommand -------------------------------------------------------------------

test('runCommand: returns stdout and status on success', () => {
	const result = runCommand('node', ['-e', 'console.log("hello")'], {});
	assert.equal(result.status, 0);
	assert.equal(result.stdout.trim(), 'hello');
});

test('runCommand (GREEN): renders a failed command with the secret redacted everywhere', () => {
	assert.throws(
		() =>
			runCommand('node', ['-e', FAIL_ECHOING_SECRET], {
				label: 'db-check',
				secrets: ['hunter2'],
			}),
		(error) => {
			// @ts-expect-error rung-0: TS18046 - error stays untyped until a later rung
			assert.match(error.message, /db-check: node .* exited with status 7/);
			// @ts-expect-error rung-0: TS18046 - error stays untyped until a later rung
			assert.match(error.message, /Password=\[REDACTED\]/);
			assert.ok(
				// @ts-expect-error rung-0: TS18046 - error stays untyped until a later rung
				!error.message.includes('hunter2'),
				'secret leaked into rendered error',
			);
			return true;
		},
	);
});

// The RED half of the paired proof (#1020 brief): the exact same failing command WITHOUT
// redaction leaks the credential into the rendered error. Proves the GREEN assertion above
// is doing real work — if someone breaks the shared-layer redaction plumbing, this pair
// goes green-green (leak) instead of staying red-green (safe).
test('runCommand (RED, paired proof): without secrets the credential reaches the rendered error', () => {
	assert.throws(
		() =>
			runCommand('node', ['-e', FAIL_ECHOING_SECRET], {
				secrets: [],
			}),
		(error) => {
			// @ts-expect-error rung-0: TS18046 - error stays untyped until a later rung
			assert.match(error.message, /Password=hunter2/);
			return true;
		},
	);
});

test('runCommand: redacts secrets that leak through argv rendering', () => {
	assert.throws(
		() =>
			runCommand('node', ['-e', 'process.exit(3)', '--password=hunter2'], {
				secrets: ['hunter2'],
			}),
		(error) => {
			// @ts-expect-error rung-0: TS18046 - error stays untyped until a later rung
			assert.match(error.message, /--password=\[REDACTED\]/);
			// @ts-expect-error rung-0: TS18046 - error stays untyped until a later rung
			assert.ok(!error.message.includes('hunter2'));
			return true;
		},
	);
});

test('runCommand: inherits ambient PGPASSWORD as a secret without declaring it', () => {
	const previous = process.env.PGPASSWORD;
	try {
		process.env.PGPASSWORD = 'ambient-hunter2';
		assert.throws(
			() =>
				runCommand(
					'node',
					[
						'-e',
						'console.error("auth failed: ambient-hunter2"); process.exit(5);',
					],
					{
						secrets: [],
					},
				),
			(error) => {
				// @ts-expect-error rung-0: TS18046 - error stays untyped until a later rung
				assert.match(error.message, /auth failed: \[REDACTED\]/);
				// @ts-expect-error rung-0: TS18046 - error stays untyped until a later rung
				assert.ok(!error.message.includes('ambient-hunter2'));
				return true;
			},
		);
	} finally {
		if (previous === undefined) {
			delete process.env.PGPASSWORD;
		} else {
			process.env.PGPASSWORD = previous;
		}
	}
});

test('runCommand: bounds a stuck command with its timeout', () => {
	const startedAt = Date.now();
	assert.throws(
		() =>
			runCommand('node', ['-e', 'setTimeout(() => {}, 30_000)'], {
				timeout: 500,
			}),
		(error) => {
			// @ts-expect-error rung-0: TS18046 - error stays untyped until a later rung
			assert.match(error.message, /ETIMEDOUT|timed out/i);
			return true;
		},
	);
	assert.ok(
		Date.now() - startedAt < 10_000,
		'timeout was not enforced promptly',
	);
});

test('runCommandOptional: degrades failures to a result instead of throwing', () => {
	const failed = runCommandOptional('node', ['-e', 'process.exit(9)'], {});
	assert.equal(failed.status, -1);
	assert.match(failed.stderr, /exited with status 9/);

	const ok = runCommandOptional('node', ['-e', 'console.log("fine")'], {});
	assert.equal(ok.status, 0);
	assert.equal(ok.stdout.trim(), 'fine');
});

test('DEFAULT_COMMAND_TIMEOUT_MS: shared default is one minute', () => {
	assert.equal(DEFAULT_COMMAND_TIMEOUT_MS, 60_000);
});

// --- parseStrictPort ----------------------------------------------------------------

test('parseStrictPort: accepts whole-number ports inside the valid range', () => {
	for (const [raw, expected] of [
		['1', 1],
		['5050', 5050],
		['65535', 65_535],
	]) {
		assert.equal(parseStrictPort(raw), expected);
	}
});

test('parseStrictPort: rejects garbage, decimals, zero, and out-of-range values via exit', () => {
	for (const raw of ['5000junk', '5000.5', '0', '65536', '', '-1']) {
		const { status, stderr } = runFixture(['strict-port', raw]);
		assert.notEqual(status, 0, `expected rejection for ${JSON.stringify(raw)}`);
		assert.match(stderr, /Invalid --port value:/);
	}
});

// --- parseLauncherArgs ---------------------------------------------------------------

test('parseLauncherArgs: applies the default port and an empty ref', () => {
	assert.deepEqual(parseLauncherArgs([], { defaultPort: 5050 }), {
		requestedRef: '',
		port: 5050,
	});
});

test('parseLauncherArgs: parses ref plus both --port spellings', () => {
	assert.deepEqual(
		parseLauncherArgs(['1016', '--port', '6060'], { defaultPort: 5050 }),
		{ requestedRef: '1016', port: 6060 },
	);
	assert.deepEqual(
		parseLauncherArgs(['1016', '--port=7070'], { defaultPort: 5050 }),
		{ requestedRef: '1016', port: 7070 },
	);
});

test('parseLauncherArgs: extra boolean flags map onto their camelCase result keys', () => {
	assert.deepEqual(
		parseLauncherArgs([], {
			defaultPort: 5000,
			extraFlags: { '--allow-migrations': 'allowMigrations' },
		}),
		{ requestedRef: '', port: 5000, allowMigrations: false },
	);
	assert.deepEqual(
		parseLauncherArgs(['--allow-migrations'], {
			defaultPort: 5000,
			extraFlags: { '--allow-migrations': 'allowMigrations' },
		}),
		{ requestedRef: '', port: 5000, allowMigrations: true },
	);
});

test('parseLauncherArgs: rejects malformed argv with precise messages', () => {
	const config = JSON.stringify({ defaultPort: 5000 });

	const missingValue = runFixture(['parse-args', '["1016","--port"]', config]);
	assert.notEqual(missingValue.status, 0);
	assert.match(missingValue.stderr, /Missing value for --port\./);

	const unknownOption = runFixture([
		'parse-args',
		'["--bogus","1016"]',
		config,
	]);
	assert.notEqual(unknownOption.status, 0);
	assert.match(unknownOption.stderr, /Unknown option: --bogus/);

	const extraPositional = runFixture(['parse-args', '["1016","1017"]', config]);
	assert.notEqual(extraPositional.status, 0);
	assert.match(extraPositional.stderr, /Unexpected extra argument: 1017\./);
});

// --- worktree discovery and root resolution (real repo) -----------------------------

test('worktree discovery: finds the root clone and this worktree', () => {
	const worktrees = getWorktrees();
	const paths = [...worktrees].map((entry) => entry.path);
	assert.ok(
		paths.includes(getRepoRoot()),
		'root clone missing from git worktree list',
	);
	assert.ok(
		paths.some((entry) => entry.includes(repoRoot)),
		'this chantier worktree missing from git worktree list',
	);
});

test('root clone resolution: lands on the standalone clone and caches deterministically', () => {
	// Inside a linked worktree the resolved root differs from this checkout's root; in a
	// plain clone they coincide. Either way the resolved root must be the one owning the
	// common git dir — its .git is a directory, while a worktree's .git is a file.
	assert.equal(
		statSync(
			path.join(
				// @ts-expect-error rung-0: TS2345 - root clone path stays untyped until a later rung
				getRootClonePath(),
				'.git',
			),
		).isDirectory(),
		true,
	);
	assert.equal(getRootClonePath(), getRootClonePath());
});

// --- tracked-file checks --------------------------------------------------------------

test('trackedChanges: returns a set of path strings from real git status', () => {
	const changes = trackedChanges(repoRoot);
	assert.ok(changes instanceof Set);
	for (const entry of changes) {
		assert.equal(typeof entry, 'string');
	}
});

test('reportNewlyDirtyFiles: reports the after-minus-before diff', () => {
	const newlyDirty = reportNewlyDirtyFiles(
		new Set(['src/a.ts']),
		new Set(['src/a.ts', 'src/b.ts']),
	);
	assert.deepEqual(newlyDirty, ['src/b.ts']);

	assert.deepEqual(
		reportNewlyDirtyFiles(new Set(['src/a.ts']), new Set(['src/a.ts'])),
		[],
	);
});

// --- port probing ----------------------------------------------------------------------

test('port probing: reports availability truthfully for free and occupied ports', async () => {
	assert.equal(await isPortAvailableOnHost('127.0.0.1', 0), true);

	const server = createServer();
	await new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			resolve(undefined);
		});
	});

	const address = server.address();
	const occupiedPort =
		// @ts-expect-error rung-0: TS2339 - AddressInfo narrowing deferred to a later rung
		address.port;
	assert.equal(await isPortAvailableOnHost('127.0.0.1', occupiedPort), false);

	await new Promise((resolve) => {
		server.close(resolve);
	});
	assert.equal(await isPortAvailableOnHost('127.0.0.1', occupiedPort), true);
});

test('ensurePortOpen: proceeds silently when the port is free', async () => {
	const { status, stdout } = runFixture(['ensure-port-open', '0', 'frontend']);
	assert.equal(status, 0);
	assert.match(stdout, /PORT-FREE/);
});

// --- env-file copying --------------------------------------------------------------------

test('ensureEnvCopy: refuses to continue without a root clone env file', () => {
	const { status, stderr } = runFixture(['missing-env-source']);
	assert.notEqual(status, 0);
	assert.match(
		stderr,
		/copy \.env\.example to \.env\.development in the root clone/,
	);
});

test('ensureEnvCopy: copies the root clone env file into a fresh worktree dir', () => {
	if (!existsSync(rootEnvFile)) {
		return;
	}

	withTempDir(
		// @ts-expect-error rung-0: TS7006 - dir stays untyped until a later rung
		(dir) => {
			const { status, stdout } = runFixture(['env-copy-real-root', dir]);
			assert.equal(status, 0);
			assert.match(stdout, /Copied .* -> /);
			// Hash comparison: the file carries real local credentials, which a failing
			// deepEqual would otherwise dump verbatim into the test log.
			assert.equal(
				sha256(path.join(dir, '.env.development')),
				sha256(rootEnvFile),
			);
		},
	);
});

test('ensureEnvCopy: refuses to touch a hardlinked twin of the root clone file', () => {
	if (!existsSync(rootEnvFile)) {
		return;
	}

	withTempDir(
		// @ts-expect-error rung-0: TS7006 - dir stays untyped until a later rung
		(dir) => {
			const target = path.join(dir, '.env.development');
			linkSync(rootEnvFile, target);
			const { status, stderr } = runFixture(['hardlink-refusal', dir]);
			assert.notEqual(status, 0);
			assert.match(stderr, /Refusing to proceed/);
			assert.match(stderr, /Use a standalone worktree env file\./);
		},
	);
});

// --- interactive selection -----------------------------------------------------------------

test('askChoice: lists choices, then fails closed in a non-interactive terminal', () => {
	const { status, stdout, stderr } = runFixture(['ask-choice']);
	assert.match(stdout, /Pick one:\n1\. first\n2\. second/);
	assert.notEqual(status, 0);
	assert.match(stderr, /terminal is not interactive/);
});

// --- resolution error handling ---------------------------------------------------------------

test('requireResolvedWorktree: returns the worktree when resolution succeeded', () => {
	const { status, stdout } = runFixture([
		'require-resolved',
		JSON.stringify({ worktree: { path: '/some/worktree' } }),
		'1020',
	]);
	assert.equal(status, 0);
	assert.match(stdout, /RESOLVED-OK/);
});

test('requireResolvedWorktree: names the exact failure for every unresolved kind', () => {
	const notFound = runFixture([
		'require-resolved',
		JSON.stringify({ kind: 'not-found', requested: '9999' }),
		'9999',
	]);
	assert.notEqual(notFound.status, 0);
	assert.match(notFound.stderr, /No PR or issue found for 9999/);

	const ambiguous = runFixture([
		'require-resolved',
		JSON.stringify({
			kind: 'issue-ambiguous',
			requested: '1024',
			worktrees: [{ path: '/wt/alpha' }, { path: '/wt/beta' }],
		}),
		'1024',
	]);
	assert.notEqual(ambiguous.status, 0);
	assert.match(ambiguous.stderr, /matched multiple worktrees/);
	assert.match(ambiguous.stderr, /\/wt\/alpha/);
	assert.match(ambiguous.stderr, /\/wt\/beta/);

	const unmatched = runFixture([
		'require-resolved',
		JSON.stringify({ kind: 'pr-unmatched', requested: '77' }),
		'77',
	]);
	assert.notEqual(unmatched.status, 0);
	assert.match(unmatched.stderr, /Could not resolve PR #77/);
});

// --- resolver wiring (discovery path against the real repo, no network) -----------------------

test('resolveReviewTarget: rejects a non-numeric ref without touching gh', () => {
	const { status, stderr } = runFixture([
		'resolve-review-target',
		'not-a-number',
	]);
	assert.notEqual(status, 0);
	assert.match(stderr, /Expected a PR or issue number/);
});

test('resolveReviewTarget: reports no ref in a non-interactive terminal', () => {
	const { status, stderr } = runFixture(['resolve-review-target']);
	assert.notEqual(status, 0);
	assert.match(
		stderr,
		/No PR\/issue ref provided in a non-interactive terminal/,
	);
});

// --- child signal handling ------------------------------------------------------------------------

test('forwardTerminationSignals: forwards SIGINT exactly once to the handler', () => {
	const { status, stdout } = runFixture(['forward-signals']);
	assert.equal(status, 0);
	assert.match(stdout, /READY/);
	assert.match(stdout, /GOT:SIGINT/);
});

// --- startup / exit plumbing -------------------------------------------------------------------------

test('runLauncherCli: maps known codes through extraErrorCases', () => {
	const { status, stderr } = runFixture(['cli-guard-handled']);
	assert.notEqual(status, 0);
	assert.match(stderr, /HANDLED:guard says no/);
});

test('runLauncherCli: falls back to the default renderer for unmapped errors', () => {
	const { status, stderr } = runFixture(['cli-guard-default']);
	assert.notEqual(status, 0);
	assert.match(stderr, /plain failure/);
});

test('runLauncherCli: stays inert when imported rather than executed directly', () => {
	const { status, stdout } = runFixture(['cli-guard-not-entry']);
	assert.equal(status, 0);
	assert.match(stdout, /GUARD-BYPASS-OK/);
	assert.ok(
		!stdout.includes('MAIN-RAN'),
		'main() must not run for a non-entry import',
	);
});
