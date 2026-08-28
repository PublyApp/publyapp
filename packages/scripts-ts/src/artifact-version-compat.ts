// Guard for upload-artifact / download-artifact version compatibility (#1728).
//
// upload-artifact v7 introduced direct upload mode (archive: false). GitHub's
// announcement (2026-02-26) states that artifacts uploaded via a v7+ action with
// `archive: false` REQUIRE download-artifact v8+ — a v4 downloader cannot read
// them. The local drift guard (check-ci-drift.ts) catches that a step CHANGED,
// but it does not express the CONSTRAINT: "if an upload uses archive: false on
// v7+, its matching download must be on v8+". Someone can bump the hash, and the
// incompatibility ships to CI — where it only surfaces on fork PRs (the one path
// that exercises the download), i.e. almost never during review.
//
// This guard closes that gap by pairing uploads to their downloads via the
// artifact `name:` field and asserting version compatibility. It runs as part of
// `just ci-drift` and is mirrored server-side in front-ci.yml::gate-selftest.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse } from 'yaml';

const workflowsDirectory = '.github/workflows';

const UPLOAD_REPO = 'actions/upload-artifact';
const DOWNLOAD_REPO = 'actions/download-artifact';
const EXPRESSION_PATTERN = /\$\{\{.*\}\}/;

/** What a `with:` entry can hold once YAML is parsed. Named on purpose: the
 * two readers below narrow to this at the boundary rather than handing
 * `unknown` to their callers, so no caller has to re-guess the shape. */
type WithScalar = string | number | boolean | null;

/**
 * Looks up a key in a `with:` block case-insensitively, because
 * GitHub Actions YAML keys are case-insensitive at evaluation time.
 */
const readWith = (step: unknown, key: string): WithScalar | undefined => {
	const withBlock = (step as { with?: Record<string, WithScalar> } | undefined)
		?.with;
	if (withBlock === undefined || withBlock === null) {
		return undefined;
	}

	for (const k of Object.keys(withBlock)) {
		if (k.toLowerCase() === key) {
			return withBlock[k];
		}
	}

	return undefined;
};

/** The `with:` value as a non-empty string, or `undefined` when absent, empty,
 * or of another type. A non-string here is a malformed workflow, not a default
 * to silently substitute — the caller decides what an absent name means. */
const readWithString = (step: unknown, key: string): string | undefined => {
	const value = readWith(step, key);
	if (typeof value !== 'string' || value.trim().length === 0) {
		return undefined;
	}

	return value;
};

/** The `with:` value as a boolean, or `undefined` when absent or of another
 * type. YAML also admits the strings "true"/"false" here, which GitHub
 * evaluates as booleans, so both spellings are accepted. */
const readWithBoolean = (step: unknown, key: string): boolean | undefined => {
	const value = readWith(step, key);
	if (typeof value === 'boolean') {
		return value;
	}
	if (value === 'true') {
		return true;
	}
	if (value === 'false') {
		return false;
	}

	return undefined;
};

/**
 * Extracts the static prefix of an artifact name — the literal portion
 * preceding the first GitHub expression `${{ … }}`. For a plain literal
 * name this returns the entire string. Two steps whose static prefixes
 * match (and whose names both contain expressions) are considered to
 * reference the same artifact at runtime, because GitHub evaluates both
 * expressions in the same workflow context.
 */
const staticPrefix = (name: string): string => {
	const exprIndex = name.indexOf('${{');
	if (exprIndex === -1) {
		return name;
	}

	return name.slice(0, exprIndex);
};

/**
 * Two artifact names are "pairable" when they are identical OR when they
 * share the same static prefix and both contain a GitHub expression. The
 * latter covers the real-repo case where the upload and download use
 * different expression paths (e.g. `${{ steps.image-tag.outputs.tag }}`
 * vs `${{ needs.build.outputs.tag }}`) that resolve to the same value.
 */
const namesPair = (a: string, b: string): boolean => {
	if (a === b) {
		return true;
	}

	const aExpr = EXPRESSION_PATTERN.test(a);
	const bExpr = EXPRESSION_PATTERN.test(b);

	if (!aExpr || !bExpr) {
		return false;
	}

	return staticPrefix(a) === staticPrefix(b);
};

/**
 * Parses a raw `uses:` line (from the YAML source text, not the parsed object)
 * into its action repo, SHA, and version comment.
 *
 * Version comments are the `# vX.Y.Z` form this repo uses on every pinned action
 * line. They are NOT part of the parsed YAML value (the YAML parser strips them),
 * so we must read the raw source line. Per the brief: do NOT rely on the comment
 * blindly and silently pass when absent — instead, REQUIRE the comment and fail
 * closed when it is missing or unparseable.
 */
const parseUsesLine = (
	usesLine: string,
): { repo: string; sha: string; major: number } | null => {
	const trimmed = usesLine.trim();

	const match = trimmed.match(
		/^uses:\s+(\S+)@([0-9a-f]{40})\s*#\s*v(\d+)(?:\.\d+)*\s*$/,
	);

	if (match === null) {
		return null;
	}

	const repo = match[1];
	const sha = match[2];
	const major = Number.parseInt(match[3], 10);

	if (repo !== UPLOAD_REPO && repo !== DOWNLOAD_REPO) {
		return null;
	}

	return { repo, sha, major };
};

/**
 * A parsed artifact step (upload or download).
 */
type ArtifactStep = {
	file: string;
	jobId: string;
	stepName: string;
	kind: 'upload' | 'download';
	artifactName: string;
	versionMajor: number;
	archiveFalse: boolean;
};

/**
 * Scans all workflow files and collects every upload-artifact and
 * download-artifact step, with its resolved version and artifact name.
 *
 * Returns `{ steps, problems }` where `problems` are parse errors (malformed
 * version comments on pinned actions) and `steps` are the successfully parsed
 * artifact steps.
 */
const collectArtifactSteps = async (
	rootDir: string,
): Promise<{ steps: ArtifactStep[]; problems: string[] }> => {
	const directory = path.join(rootDir, workflowsDirectory);
	const dirEntries = await readdir(directory, { withFileTypes: true });
	const problems: string[] = [];
	const steps: ArtifactStep[] = [];

	const files = dirEntries
		.filter(
			(entry) =>
				entry.isFile() &&
				(entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')),
		)
		.map((entry) => entry.name)
		.sort();

	for (const file of files) {
		const raw = await readFile(path.join(directory, file), 'utf8');
		const lines = raw.split('\n');
		const document = parse(raw);
		const jobs = document?.jobs ?? {};

		for (const jobId of Object.keys(jobs).sort()) {
			const jobSteps = jobs[jobId]?.steps ?? [];

			for (const [index, step] of jobSteps.entries()) {
				const uses = typeof step?.uses === 'string' ? step.uses : undefined;

				if (uses === undefined) {
					continue;
				}

				const stepName =
					typeof step?.name === 'string' && step.name.trim().length > 0
						? step.name.trim()
						: `step#${index}`;
				const stepPath = `${file}::${jobId}::${stepName}`;

				// Find the raw `uses:` line in the source text to extract the version comment.
				const usesLine = lines.find(
					(line) =>
						line.includes('uses:') && line.includes(uses.split('#')[0].trim()),
				);

				if (usesLine === undefined) {
					continue;
				}

				const parsed = parseUsesLine(usesLine);
				const repoFromUses = uses.split('@')[0];

				if (parsed === null) {
					if (repoFromUses === UPLOAD_REPO || repoFromUses === DOWNLOAD_REPO) {
						problems.push(
							`${stepPath}: uses: ${uses} — pinned to ${repoFromUses} but the version comment (e.g. '# v7.0.1') is missing or malformed. This guard cannot determine the action version; failing closed rather than assuming.`,
						);
					}

					continue;
				}

				const nameValue = readWithString(step, 'name');
				const artifactName = nameValue ?? `unnamed-step-${index}`;

				const isUpload = parsed.repo === UPLOAD_REPO;
				const archiveFalse =
					isUpload && readWithBoolean(step, 'archive') === false;

				steps.push({
					file,
					jobId,
					stepName,
					kind: isUpload ? 'upload' : 'download',
					artifactName,
					versionMajor: parsed.major,
					archiveFalse,
				});
			}
		}
	}

	return { steps, problems };
};

/**
 * Scans all workflow files and pairs upload-artifact steps to download-artifact
 * steps by artifact name, enforcing version compatibility.
 *
 * Rule (from the brief):
 *   if an upload-artifact step is v7+ AND `archive: false`, then any
 *   download-artifact step consuming that artifact name must be v8+.
 *
 * Artifact names are paired by their raw string value. Two names that differ
 * only in their GitHub expression portion (e.g.
 * `e2e-stack-images-${{ steps.image-tag.outputs.tag }}` on upload vs
 * `e2e-stack-images-${{ needs.build.outputs.tag }}` on download) share the
 * same static prefix and are considered to reference the same artifact,
 * because both expressions are evaluated in the same workflow context and
 * resolve to the same value. Literal names must match exactly.
 */
export const findArtifactVersionIncompatibilities = async ({
	rootDir,
}: {
	rootDir: string;
}): Promise<string[]> => {
	const { steps, problems } = await collectArtifactSteps(rootDir);
	const findings = [...problems];

	const uploads = steps.filter(
		(step): step is Extract<ArtifactStep, { kind: 'upload' }> =>
			step.kind === 'upload',
	);
	const downloads = steps.filter(
		(step): step is Extract<ArtifactStep, { kind: 'download' }> =>
			step.kind === 'download',
	);

	for (const upload of uploads) {
		// The pairing rule only applies when archive: false is set on v7+.
		if (!upload.archiveFalse) {
			continue;
		}

		if (upload.versionMajor < 7) {
			// archive: false is not a v7+ feature; skip.
			continue;
		}

		const requiredDownloadMajor = 8;

		const matchingDownloads = downloads.filter((download) =>
			namesPair(upload.artifactName, download.artifactName),
		);

		if (matchingDownloads.length === 0) {
			continue;
		}

		for (const download of matchingDownloads) {
			if (download.versionMajor < requiredDownloadMajor) {
				findings.push(
					`upload-artifact v7+ with \`archive: false\` on \`${upload.file}::${upload.jobId}::${upload.stepName}\` produces an artifact incompatible with \`download-artifact\` v${download.versionMajor} on \`${download.file}::${download.jobId}::${download.stepName}\` — upload-artifact v7+ with \`archive: false\` requires download-artifact v8+ (v4 cannot read direct-upload artifacts). Upgrade the download step to v8+.`,
				);
			}
		}
	}

	return findings;
};

const isDirectRun =
	process.argv[1] &&
	path
		.resolve(process.argv[1])
		.split(path.sep)
		.join('/')
		.endsWith('packages/scripts-ts/src/artifact-version-compat.ts');

if (isDirectRun) {
	const findings = await findArtifactVersionIncompatibilities({
		rootDir: process.cwd(),
	});

	if (findings.length > 0) {
		console.error(
			'upload-artifact / download-artifact version compatibility guard (#1728):\n',
		);

		for (const finding of findings) {
			console.error(`  ${finding}\n`);
		}

		console.error(
			'Resolve the incompatibility: upload-artifact v7+ with archive: false requires download-artifact v8+. See docs/guides/local-ci-gate.md.',
		);
		process.exit(1);
	}

	console.log(
		'artifact version guard: every upload-artifact v7+ with archive: false is paired with a compatible download-artifact v8+.',
	);
}
