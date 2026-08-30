import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

// GHCR cleanup decision logic for front-e2e.yml's `cleanup` job ("Delete run
// image versions" step).
//
// WHY THIS EXISTS (round-1 fix for PR #1396 / #1362)
// ---------------------------------------------------
// The four `publyapp-e2e-*` container packages are per-run scratch created by
// THIS workflow's own pushes. Whenever a package has exactly ONE tagged
// version — a freshly created package, or any run whose predecessors cleaned
// theirs — GitHub refuses the version delete with
//
//   HTTP 400: You cannot delete the last tagged version of a package. You
//   must delete the package instead.
//
// (documented GitHub behaviour: delete the package instead). That 400 turned
// this step — and therefore `front-e2e-gate` — red on every run of PR #1396.
//
// The supported primitive for that case is PACKAGE deletion, scoped by the
// owner type GitHub's package API branches on: `/orgs/{owner}/...` for an
// organization, `/user/...` for a user. #1362 moved the repository from a
// user namespace (radandevist) to the PublyApp organization; deriving the
// scope from `GET /users/{owner}` → `.type` at runtime (instead of
// hard-coding "orgs") is what lets this cleanup survive either shape.
//
// SAFETY RULES PRESERVED FROM THE INLINE VERSION
// ----------------------------------------------
// - A version is deleted only when its CURRENT tag list (re-read immediately
//   before the delete) is exactly [this run's tag]; a concurrent tag appearing
//   between listing and delete is caught and the delete skipped.
// - A package is deleted only when the RE-LISTED version set is exactly
//   {this run's version}; otherwise the package delete is skipped and the
//   plain version delete is retried (which now succeeds, because the package
//   no longer has a single tagged version).
// - A cleanup that cannot delete is a broken check, not a green one (#1018):
//   every refusal — including a 403 from a token lacking package admin — is
//   failed LOUDLY with GitHub's exact message. No suppression anywhere.
//
// The `gh api` runner is injectable so tests drive every branch in-process;
// the direct-run CLI boundary is exercised against a fake `gh` binary the
// same way ci-changed-paths.test.ts does.

export const LAST_TAGGED_VERSION_400_MESSAGE =
	'You cannot delete the last tagged version of a package';

export const E2E_PACKAGES = [
	'publyapp-e2e-migrate',
	'publyapp-e2e-api',
	'publyapp-e2e-request-counter',
	'publyapp-e2e-front',
];

export type GhApiResult = {
	status: number;
	stdout: string;
	stderr: string;
};

export type GhApiRunner = (args: string[]) => GhApiResult;

export type ContainerVersion = {
	id: string;
	tags: string[];
};

export type CleanupMessage = {
	level: 'notice' | 'warning' | 'error';
	text: string;
};

export type CleanupOutcome = {
	messages: CleanupMessage[];
	failed: boolean;
};

/**
 * The real runner: one `gh api` invocation per call, spawnSync semantics —
 * never throws; a nonzero exit is data. gh prints its "HTTP 4xx: ..."
 * diagnostics on stderr, which the loud-failure paths surface verbatim.
 */
export const execFileGhApi: GhApiRunner = (args) => {
	try {
		const stdout = execFileSync('gh', ['api', ...args], {
			encoding: 'utf8',
		});

		return { status: 0, stdout, stderr: '' };
	} catch (error) {
		const failure = error as {
			status?: number;
			stdout?: string;
			stderr?: string;
			message?: string;
		};

		return {
			status: typeof failure.status === 'number' ? failure.status : 1,
			stdout: failure.stdout ?? '',
			stderr: failure.stderr ?? failure.message ?? '',
		};
	}
};

/**
 * True only for the EXACT documented refusal this fix branches on. Any other
 * failure (403, 404, network, rate limit) must NOT be mistaken for it.
 */
export const isLastTaggedVersionRejection = (result: GhApiResult): boolean =>
	result.status !== 0 &&
	result.stderr.includes(LAST_TAGGED_VERSION_400_MESSAGE);

/**
 * Strictly parses the paginated versions listing into ContainerVersion[]
 * entries, or `undefined` when the payload cannot be trusted. Mirrors the
 * strict-boundary philosophy of parseChangedFilesTotal(): a malformed
 * response must surface as a loud parse failure, never as fabricated
 * "nothing to delete".
 */
export const parseVersionsJson = (
	stdout: string,
): ContainerVersion[] | undefined => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}

	if (!Array.isArray(parsed)) {
		return undefined;
	}

	const versions: ContainerVersion[] = [];

	for (const entry of parsed) {
		if (entry === null || typeof entry !== 'object') {
			return undefined;
		}

		const record = entry as {
			id?: unknown;
			metadata?: {
				container?: {
					tags?: unknown;
				};
			};
		};

		if (typeof record.id !== 'string' && typeof record.id !== 'number') {
			return undefined;
		}

		const rawTags = record.metadata?.container?.tags;
		const tags = Array.isArray(rawTags)
			? rawTags.filter((tag): tag is string => typeof tag === 'string')
			: [];

		versions.push({ id: String(record.id), tags });
	}

	return versions;
};

/**
 * Strictly parses a single version GET, same contract as parseVersionsJson().
 */
export const parseVersionJson = (
	stdout: string,
): ContainerVersion | undefined => {
	const versions = parseVersionsJson(`[${stdout}]`);

	return versions?.[0];
};

export type VersionDeletionDecision =
	| { outcome: 'proceed' }
	| { outcome: 'skip'; reason: string };

/**
 * Pure decision for one candidate version, given its CURRENT tag list (the
 * re-read that must happen immediately before any delete). Deletes are only
// ever allowed when this run's tag is EXCLUSIVELY on the version.
 */
export const decideVersionDeletion = ({
	versionTags,
	runTag,
}: {
	versionTags: string[];
	runTag: string;
}): VersionDeletionDecision => {
	if (!versionTags.includes(runTag)) {
		return {
			outcome: 'skip',
			reason: `this run's tag ${runTag} is no longer on the version (current tags: ${
				versionTags.length > 0 ? versionTags.join(', ') : '(none)'
			})`,
		};
	}

	const otherTags = versionTags.filter((tag) => tag !== runTag);

	if (otherTags.length > 0) {
		return {
			outcome: 'skip',
			reason: `tag ${runTag} shares the version with other run tags (${otherTags.join(
				', ',
			)}); GitHub's package API cannot delete a single tag and deleting the version would break every run still referencing that digest`,
		};
	}

	return { outcome: 'proceed' };
};

export type PackageDeletionDecision =
	| { outcome: 'delete-package' }
	| { outcome: 'fallback-to-version-delete'; reason: string };

/**
 * Race guard for the package-delete branch. The package may only be deleted
 * when the RE-LISTED version set is exactly {this run's version} — one
 * version, the expected id, carrying exactly [runTag]. Anything else (a
 * concurrent run's version, a tag added between the two reads) falls back to
 * the plain version delete, which succeeds once the package is no longer
 * down to a single tagged version.
 */
export const decidePackageDeletion = ({
	versions,
	expectedVersionId,
	runTag,
}: {
	versions: ContainerVersion[];
	expectedVersionId: string;
	runTag: string;
}): PackageDeletionDecision => {
	const described =
		versions.length === 0
			? '(empty)'
			: versions
					.map((version) => `${version.id}[${version.tags.join(',')}]`)
					.join(', ');

	if (versions.length !== 1) {
		return {
			outcome: 'fallback-to-version-delete',
			reason: `the re-listed version set is no longer exactly this run's version (${described})`,
		};
	}

	const only = versions[0];

	if (only.id !== expectedVersionId) {
		return {
			outcome: 'fallback-to-version-delete',
			reason: `the re-listed version set is no longer exactly this run's version (${described})`,
		};
	}

	if (only.tags.length !== 1 || !only.tags.every((tag) => tag === runTag)) {
		return {
			outcome: 'fallback-to-version-delete',
			reason: `the re-listed version's tag set is no longer exactly [${runTag}] (${described})`,
		};
	}

	return { outcome: 'delete-package' };
};

/**
 * Derives the package-API path prefix from the ACTUAL owner type instead of
 * hard-coding "orgs" (#1362): organizations scope under /orgs/{owner},
 * user-owned packages under /user. Anything unrecognized fails closed —
 * guessing a scope would aim deletes at the wrong namespace.
 */
export const resolvePackagesPathPrefix = ({
	owner,
	ghApi,
	messages,
}: {
	owner: string;
	ghApi: GhApiRunner;
	messages: CleanupMessage[];
}): string | undefined => {
	const response = ghApi([`/users/${owner}`]);

	if (response.status !== 0) {
		messages.push({
			level: 'error',
			text: `Could not resolve the GHCR package scope: GET /users/${owner} failed with HTTP ${response.status}. ${response.stderr.trim()}`,
		});

		return undefined;
	}

	let ownerType: unknown;

	try {
		ownerType = (JSON.parse(response.stdout) as { type?: unknown }).type;
	} catch {
		ownerType = undefined;
	}

	if (ownerType === 'Organization') {
		return `/orgs/${owner}`;
	}

	if (ownerType === 'User') {
		return '/user';
	}

	messages.push({
		level: 'error',
		text: `Could not resolve the GHCR package scope: GET /users/${owner} returned an unexpected owner type (${String(
			ownerType,
		)}); refusing to guess between /orgs/ and /user/.`,
	});

	return undefined;
};

/**
 * Cleans up one package. Returns false when something failed loudly (the
 * caller aggregates and exits nonzero); true when this package is done —
 * including the legitimate nothing-carried-this-tag case.
 */
const cleanupOnePackage = ({
	name,
	runTag,
	pathPrefix,
	ghApi,
	messages,
}: {
	name: string;
	runTag: string;
	pathPrefix: string;
	ghApi: GhApiRunner;
	messages: CleanupMessage[];
}): boolean => {
	const versionsPath = `${pathPrefix}/packages/container/${name}`;

	const listResponse = ghApi([
		'--paginate',
		`${versionsPath}/versions?per_page=100`,
	]);

	if (listResponse.status !== 0) {
		messages.push({
			level: 'warning',
			text: `Could not list GHCR versions for ${name}: HTTP ${listResponse.status}. ${listResponse.stderr.trim()}`,
		});

		return false;
	}

	const versions = parseVersionsJson(listResponse.stdout);

	if (versions === undefined) {
		messages.push({
			level: 'error',
			text: `Could not parse GHCR version list for ${name}.`,
		});

		return false;
	}

	const candidates = versions.filter((version) =>
		version.tags.includes(runTag),
	);

	// Nothing carries this run's tag → nothing to delete (mirrors the inline
	// version's bare `continue`).
	if (candidates.length === 0) {
		return true;
	}

	for (const candidate of candidates) {
		// Re-read the version right before deleting: exclusivity must hold on
		// the CURRENT tag list, not the listing snapshot.
		const freshResponse = ghApi([`${versionsPath}/versions/${candidate.id}`]);

		if (freshResponse.status !== 0) {
			messages.push({
				level: 'error',
				text: `Could not re-read GHCR version ${candidate.id} for ${name}; skipping delete to avoid deleting a version a concurrent run may now share. HTTP ${freshResponse.status}. ${freshResponse.stderr.trim()}`,
			});

			return false;
		}

		const fresh = parseVersionJson(freshResponse.stdout);

		if (fresh === undefined) {
			messages.push({
				level: 'error',
				text: `Could not parse GHCR version ${candidate.id} for ${name}.`,
			});

			return false;
		}

		const decision = decideVersionDeletion({
			versionTags: fresh.tags,
			runTag,
		});

		if (decision.outcome === 'skip') {
			messages.push({
				level: 'notice',
				text: `Skipping GHCR version ${candidate.id} for ${name}: ${decision.reason}.`,
			});

			continue;
		}

		const deleteResponse = ghApi([
			'--method',
			'DELETE',
			`${versionsPath}/versions/${candidate.id}`,
		]);

		if (deleteResponse.status === 0) {
			messages.push({
				level: 'notice',
				text: `Deleted GHCR version ${candidate.id} of ${name} (exclusively tagged ${runTag}).`,
			});

			continue;
		}

		if (!isLastTaggedVersionRejection(deleteResponse)) {
			// Loud by design (#1018): a 403 here means the GITHUB_TOKEN lacks
			// package-admin access for this package — the owner must grant it
			// (package settings → "Manage Actions access" → repository
			// `publyapp` role Admin). Never swallow, never pretend green.
			messages.push({
				level: 'error',
				text: `Could not delete GHCR version ${candidate.id} for ${name}: HTTP ${deleteResponse.status}. ${deleteResponse.stderr.trim()} Public packages past the 5000-download threshold refuse version deletion with HTTP 400 (visibility flip tracked in #1018); if this is HTTP 403, grant the token access via the package's "Manage Actions access" (repository publyapp, role Admin).`,
			});

			return false;
		}

		// The documented last-tagged-version edge (#1362 round 1): this run
		// created (or is down to) the package's ONLY tagged version, so GitHub
		// refuses the version delete and the PACKAGE must be deleted instead —
		// but only while the package verifiably still holds exactly this run's
		// scratch version.
		const relistResponse = ghApi([
			'--paginate',
			`${versionsPath}/versions?per_page=100`,
		]);

		if (relistResponse.status !== 0) {
			messages.push({
				level: 'error',
				text: `GitHub refused the version delete for ${name} as the last tagged version, but the safety re-list failed: HTTP ${relistResponse.status}. ${relistResponse.stderr.trim()}`,
			});

			return false;
		}

		const relisted = parseVersionsJson(relistResponse.stdout);

		if (relisted === undefined) {
			messages.push({
				level: 'error',
				text: `GitHub refused the version delete for ${name} as the last tagged version, but the safety re-list could not be parsed.`,
			});

			return false;
		}

		const packageDecision = decidePackageDeletion({
			versions: relisted,
			expectedVersionId: candidate.id,
			runTag,
		});

		if (packageDecision.outcome === 'fallback-to-version-delete') {
			// A concurrent run touched the package between our two reads: do
			// NOT delete the package. Retry the version delete — the package no
			// longer has a single tagged version, so it should now succeed.
			messages.push({
				level: 'notice',
				text: `Skipping the package delete for ${name}: ${packageDecision.reason}; falling back to the version delete.`,
			});

			const retryResponse = ghApi([
				'--method',
				'DELETE',
				`${versionsPath}/versions/${candidate.id}`,
			]);

			if (retryResponse.status === 0) {
				messages.push({
					level: 'notice',
					text: `Deleted GHCR version ${candidate.id} of ${name} (exclusively tagged ${runTag}) after the concurrent-activity fallback.`,
				});

				continue;
			}

			messages.push({
				level: 'error',
				text: `Could not delete GHCR version ${candidate.id} for ${name}: HTTP ${retryResponse.status}. ${retryResponse.stderr.trim()}`,
			});

			return false;
		}

		const packageDeleteResponse = ghApi(['--method', 'DELETE', versionsPath]);

		if (packageDeleteResponse.status === 0) {
			messages.push({
				level: 'notice',
				text: `Deleted GHCR package ${name}: version ${candidate.id} was the last tagged version (GitHub answers the version delete with HTTP 400 "${LAST_TAGGED_VERSION_400_MESSAGE}") and the re-listed version set was exactly this run's scratch version.`,
			});

			continue;
		}

		messages.push({
			level: 'error',
			text: `Could not delete GHCR package ${name} (its only tagged version belongs to this run, so the version delete was refused with HTTP 400): HTTP ${packageDeleteResponse.status}. ${packageDeleteResponse.stderr.trim()} If this is HTTP 403, the GITHUB_TOKEN lacks package-admin access for this package — grant it via the package's "Manage Actions access" (repository publyapp, role Admin). A cleanup that cannot delete is a broken check, not a green one (#1018).`,
		});

		return false;
	}

	return true;
};

/**
 * Full cleanup across the four e2e scratch packages. Fork runs and runs with
 * no build tag short-circuit exactly as the inline step always did.
 */
export const runE2ECleanup = ({
	owner,
	runTag,
	forkRun = false,
	packages = E2E_PACKAGES,
	ghApi,
}: {
	owner: string;
	runTag: string;
	forkRun?: boolean;
	packages?: readonly string[];
	ghApi: GhApiRunner;
}): CleanupOutcome => {
	const messages: CleanupMessage[] = [];

	// #1021: a fork run pushed nothing to GHCR (read-only token; the images
	// travelled as an artifact), so there is nothing of this run's to delete.
	if (forkRun) {
		messages.push({
			level: 'notice',
			text: 'Fork run: no images were pushed to GHCR, so there is nothing to clean up.',
		});

		return { messages, failed: false };
	}

	if (runTag.length === 0) {
		messages.push({
			level: 'warning',
			text: 'Build did not emit an image tag; skipping GHCR cleanup.',
		});

		return { messages, failed: false };
	}

	const pathPrefix = resolvePackagesPathPrefix({ owner, ghApi, messages });

	if (pathPrefix === undefined) {
		return { messages, failed: true };
	}

	let failed = false;

	for (const name of packages) {
		const succeeded = cleanupOnePackage({
			name,
			runTag,
			pathPrefix,
			ghApi,
			messages,
		});

		if (!succeeded) {
			failed = true;
		}
	}

	return { messages, failed };
};

const toPosixPath = (value: string): string => {
	return value.split(path.sep).join('/');
};

const isDirectRun =
	process.argv[1] &&
	toPosixPath(process.argv[1]).endsWith(
		'packages/scripts-ts/src/ci-e2e-cleanup.ts',
	);

if (isDirectRun) {
	const outcome = runE2ECleanup({
		owner: process.env.GITHUB_REPOSITORY_OWNER ?? '',
		runTag: process.env.E2E_IMAGE_TAG ?? '',
		forkRun: process.env.FORK_RUN === 'true',
		ghApi: execFileGhApi,
	});

	if ((process.env.GITHUB_REPOSITORY_OWNER ?? '').length === 0) {
		console.error(
			'::error::GITHUB_REPOSITORY_OWNER is empty; refusing to aim package deletes anywhere.',
		);
		process.exit(1);
	}

	for (const message of outcome.messages) {
		const line = `::${message.level}::${message.text}`;
		(message.level === 'error' ? console.error : console.log)(line);
	}

	process.exit(outcome.failed ? 1 : 0);
}
