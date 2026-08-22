import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// Supply-chain guard: fails when any `uses: owner/repo@<ref>` in
// .github/workflows/** is not pinned to a full 40-hex-char commit SHA.
// Local actions (starting with `./`) are exempt — they live in the repo
// and are already covered by the drift guard's step-content hash.
//
// This prevents the exact class of issue found in round-1 review of
// PR #1248: workflow files using bare moving tags (v4, v7, etc.) instead
// of the commit SHA they actually resolve to.
//
// Paired proof: unpin one line → red naming file+line; revert → green.

const workflowsDir = '.github/workflows';
const shaPattern = /^[0-9a-f]{40}$/;

/**
 * Scans all .github/workflows/*.yml files and returns an array of
 * { file, line, uses } objects for every non-local `uses:` that is
 * not pinned to a 40-char hex SHA.
 */
export const findUnpinnedActions = async ({ rootDir = '.' } = {}) => {
	const dir = path.join(rootDir, workflowsDir);
	const files = await readdir(dir);
	const findings = [];

	for (const file of files) {
		if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;

		const filePath = path.join(dir, file);
		const content = await readFile(filePath, 'utf8');
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Match `uses:` — YAML indentation-insensitive
			const match = line.match(/uses:\s*(\S+)/);
			if (!match) continue;

			const uses = match[1];

			// Skip local actions (./path)
			if (uses.startsWith('./')) continue;

			// Extract the ref after @
			const atIdx = uses.lastIndexOf('@');
			if (atIdx === -1) continue;

			const ref = uses.slice(atIdx + 1);

			// Accept only a full 40-hex SHA
			if (!shaPattern.test(ref)) {
				findings.push({
					file,
					line: i + 1,
					uses,
				});
			}
		}
	}

	return findings;
};

// --- CLI entry point ---
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url)) {
	const findings = await findUnpinnedActions();

	if (findings.length > 0) {
		console.error(
			`::error::${findings.length} action(s) in .github/workflows are not pinned to a full SHA:`,
		);
		for (const f of findings) {
			console.error(`  ${f.file}:${f.line}: ${f.uses}`);
		}
		process.exit(1);
	}

	console.log('All uses: references in .github/workflows are pinned to full commit SHAs.');
}
