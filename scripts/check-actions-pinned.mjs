import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Supply-chain guard: fails when any `uses:` in .github/workflows/** is
// not pinned to an immutable reference:
//   - `owner/repo@<ref>` must carry a full 40-hex-char commit SHA;
//     a value with NO `@ref` at all is unparseable/unpinnable input and
//     fails closed rather than being skipped.
//   - `docker://image[:tag][@digest]` container references must be pinned
//     by content digest (`@sha256:<64-hex>`); a tag-only or digest-less
//     image is mutable and fails.
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
const dockerDigestPattern = /^sha256:[0-9a-f]{64}$/;

/**
 * Scans all .github/workflows/*.yml files and returns an array of
 * { file, line, uses } objects for every non-local `uses:` that is not
 * pinned to an immutable reference (40-char hex SHA for actions, content
 * digest for `docker://` images), including undecidable input such as a
 * missing `@ref`.
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
			// Strip YAML comments (# preceded by whitespace or at line start)
			// before matching, so commented-out uses: lines are not flagged.
			const line = lines[i].replace(/#.*/, '');

			// Match `uses:` — YAML indentation-insensitive
			const match = line.match(/uses:\s*(\S+)/);
			if (!match) continue;

			const uses = match[1];

			// Skip local actions (./path)
			if (uses.startsWith('./')) continue;

			// Container references (docker://…): only a content digest pin is
			// immutable. Tag-only or digest-less images fail.
			if (uses.startsWith('docker://')) {
				const digestIdx = uses.lastIndexOf('@');
				const digest = digestIdx === -1 ? '' : uses.slice(digestIdx + 1);

				if (!dockerDigestPattern.test(digest)) {
					findings.push({
						file,
						line: i + 1,
						uses,
					});
				}
				continue;
			}

			// Fail-closed on input without a `@ref` at all: it cannot be
			// decided, so it never passes silently.
			const atIdx = uses.lastIndexOf('@');
			if (atIdx === -1) {
				findings.push({
					file,
					line: i + 1,
					uses,
				});
				continue;
			}

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
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	const findings = await findUnpinnedActions();

	if (findings.length > 0) {
		console.error(
			`::error::${findings.length} uses: reference(s) in .github/workflows are not pinned to an immutable ref (full SHA / docker digest):`,
		);
		for (const f of findings) {
			console.error(`  ${f.file}:${f.line}: ${f.uses}`);
		}
		process.exit(1);
	}

	console.log(
		'All uses: references in .github/workflows are pinned to immutable refs (full SHAs / docker digests).',
	);
}
