/**
 * runOxlint — thin, testable wrapper around the oxlint CLI used by the
 * lint-ts integration tests. The binary and config are resolved relative to
 * the workspace root so the wrapper works in both git worktrees and flat CI
 * checkouts (node_modules always lives at the workspace root).
 *
 * The wrapper is intentionally loud: if oxlint returns no parseable JSON
 * (empty stdout, or output that fails JSON.parse) it throws an Error that
 * embeds the oxlint exit status and stderr, so CI failures surface the real
 * cause instead of a silent `SyntaxError: Unexpected end of JSON input`.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OXLINTRC_PATH = fileURLToPath(
	new URL('../../../../.oxlintrc.json', import.meta.url),
);
// In a git worktree the workspace root sits inside the main repo, but in
// CI (flat checkout) the workspace root IS the repo root.  Both environments
// always have node_modules at the workspace root, so resolve the binary
// there instead of two levels above (which escapes the checkout in CI).
const OXLINT_BIN = join(WORKSPACE_ROOT, 'node_modules/.bin/oxlint');

/**
 * Minimal contract `runOxlint` needs from `execFileSync`. Declaring the
 * narrow shape here (instead of `typeof execFileSync`, whose overloads
 * force evidence-discarding casts on test doubles) keeps both the wrapper
 * and its fakes fully typed.
 */
export type ExecFileSyncLike = (
	file: string,
	args: readonly string[],
	options: { encoding: 'utf8'; cwd: string },
) => string;

export interface RunOxlintOptions {
	cwd?: string;
	oxlintBin?: string;
	oxlintrcPath?: string;
	execFileSyncImpl?: ExecFileSyncLike;
}

export interface OxlintResult {
	diagnostics: unknown[];
}

const parseOutput = (
	output: string,
	status: unknown,
	stderr: string,
): OxlintResult => {
	const trimmed = output.trim();

	if (trimmed.length === 0) {
		throw new Error(
			`oxlint produced no parseable JSON (exit ${status}): ${stderr || '<no stderr>'}`,
		);
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(trimmed);
	} catch {
		throw new Error(
			`oxlint produced no parseable JSON (exit ${status}): ${stderr || '<no stderr>'}`,
		);
	}

	// oxlint output shape is { diagnostics: [...] } when clean.
	if (
		parsed &&
		typeof parsed === 'object' &&
		Array.isArray((parsed as { diagnostics?: unknown }).diagnostics)
	) {
		return parsed as OxlintResult;
	}

	return { diagnostics: [] };
};

export const runOxlint = (
	filePaths: string[],
	options: RunOxlintOptions = {},
): OxlintResult => {
	const {
		cwd = WORKSPACE_ROOT,
		oxlintBin = OXLINT_BIN,
		oxlintrcPath = OXLINTRC_PATH,
		execFileSyncImpl = execFileSync,
	}: RunOxlintOptions = options;

	let output = '';
	let stderr = '';
	let status: unknown = 0;

	try {
		output = execFileSyncImpl(
			oxlintBin,
			['--config', oxlintrcPath, '--format', 'json', '--quiet', ...filePaths],
			{ encoding: 'utf8', cwd },
		);
	} catch (error) {
		if (
			!(
				typeof error === 'object' &&
				error !== null &&
				'stdout' in error &&
				'status' in error
			)
		) {
			throw error;
		}

		const execError = error as {
			stdout?: string | Buffer;
			stderr?: string | Buffer;
			status?: number;
		};

		output = String(execError.stdout ?? '');
		stderr = String(execError.stderr ?? '');
		status = execError.status ?? 'unknown';

		return parseOutput(output, status, stderr);
	}

	const successResult = parseOutput(output, status, stderr);

	return successResult;
};
