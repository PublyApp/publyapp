import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
	decidePackageDeletion,
	decideVersionDeletion,
	E2E_PACKAGES,
	execFileGhApi,
	isLastTaggedVersionRejection,
	LAST_TAGGED_VERSION_400_MESSAGE,
	parseVersionJson,
	parseVersionsJson,
	runE2ECleanup,
	type CleanupMessage,
	type CleanupOutcome,
	type ContainerVersion,
	type GhApiResult,
	type GhApiRunner,
} from './ci-e2e-cleanup.ts';

// Standing proof for PR #1396's round-1 fix (#1362): whenever a
// `publyapp-e2e-*` package holds exactly ONE tagged version — a package this
// run just created, or one whose predecessor runs cleaned theirs — GitHub
// answers the version delete with HTTP 400 and documents deleting the PACKAGE
// instead. These tests drive every branch of that decision in-process through
// an injected `gh api` runner, plus the direct-run CLI boundary against a
// fake `gh` binary, the same way ci-changed-paths.test.ts does.

const ORG = 'PublyApp';
const RUN_TAG = '999-1';
const PKG = 'publyapp-e2e-front';
const BASE = `/orgs/${ORG}/packages/container/${PKG}`;

const rawVersion = (id: string | number, tags: string[]) => ({
	id,
	metadata: { container: { tags } },
});

const ok = (body: unknown = ''): GhApiResult => ({
	status: 0,
	stdout: typeof body === 'string' ? body : JSON.stringify(body),
	stderr: '',
});

const httpFail = (status: number, stderr: string): GhApiResult => ({
	status,
	stdout: '',
	stderr,
});

const lastTaggedRejection = (): GhApiResult =>
	httpFail(
		400,
		`gh: HTTP 400: ${LAST_TAGGED_VERSION_400_MESSAGE}. You must delete the package instead.`,
	);

type Call = { args: string[] };

type Route = {
	/** Defaults to GET; deletes must opt in explicitly. */
	method?: 'GET' | 'DELETE';
	pattern: RegExp;
	respond: (attempt: number) => GhApiResult;
};

const keyOf = (args: string[]): string => {
	const method = args[0] === '--method' ? String(args[1]) : 'GET';
	const url = args.find((arg) => arg.startsWith('/')) ?? '';

	return `${method} ${url}`;
};

/**
 * Builds a recording, route-table `gh api` runner. Routes match on the URL
 * argument; `respond` receives the 0-based attempt counter for that exact
 * (method, url) pair, so repeated calls (initial list vs safety re-list) can
 * diverge. An unrouted call throws — a test must never pass because the fake
 * silently answered something the real flow never asks.
 */
const makeGhApi = (routes: Route[]) => {
	const calls: Call[] = [];

	const ghApi: GhApiRunner = (args) => {
		calls.push({ args });

		const key = keyOf(args);
		const attempt = calls.filter((call) => keyOf(call.args) === key).length - 1;
		const method = key.split(' ')[0];
		const url = args.find((arg) => arg.startsWith('/')) ?? '';
		const route = routes.find(
			(candidate) =>
				(candidate.method ?? 'GET') === method && candidate.pattern.test(url),
		);

		if (route === undefined) {
			throw new Error(`fake gh api has no route for: ${args.join(' ')}`);
		}

		return route.respond(attempt);
	};

	return { ghApi, calls };
};

const ownerRoute = (type: string): Route => ({
	pattern: new RegExp(`^/users/${ORG}$`),
	respond: () => ok({ login: ORG, type }),
});

const deleteCalls = (calls: Call[]): string[] =>
	calls
		.filter((call) => call.args[0] === '--method')
		.map((call) => call.args[call.args.length - 1]);

const textsAtLevel = (
	outcome: CleanupOutcome,
	level: CleanupMessage['level'],
): string[] =>
	outcome.messages
		.filter((message) => message.level === level)
		.map((message) => message.text);

const allText = (outcome: CleanupOutcome): string =>
	outcome.messages
		.map((message) => `${message.level}: ${message.text}`)
		.join('\n');

// ---------------------------------------------------------------------------
// REQUIRED BRANCH 1: last tagged version → PACKAGE delete (race-guarded)
// ---------------------------------------------------------------------------

test('the only tagged version of a package this run created deletes the PACKAGE (org scope)', () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('42', [RUN_TAG])]),
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(rawVersion('42', [RUN_TAG])),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: (attempt) =>
				attempt === 0
					? lastTaggedRejection()
					: httpFail(500, 'unexpected second version delete'),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${BASE}$`),
			respond: () => ok(),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, false, allText(outcome));
	assert.deepEqual(deleteCalls(calls), [`${BASE}/versions/42`, BASE]);
	assert.match(allText(outcome), /Deleted GHCR package publyapp-e2e-front/);
	assert.match(
		textsAtLevel(outcome, 'notice').join('\n'),
		new RegExp(LAST_TAGGED_VERSION_400_MESSAGE.slice(0, 24)),
	);
});

test('the same branch derives /user/ for a USER-owned repository instead of hard-coding orgs', () => {
	const userBase = `/user/packages/container/${PKG}`;
	const { ghApi, calls } = makeGhApi([
		ownerRoute('User'),
		{
			pattern: new RegExp(`^${userBase}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('42', [RUN_TAG])]),
		},
		{
			pattern: new RegExp(`^${userBase}/versions/42$`),
			respond: () => ok(rawVersion('42', [RUN_TAG])),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${userBase}/versions/42$`),
			respond: (attempt) =>
				attempt === 0 ? lastTaggedRejection() : httpFail(500, 'no retry'),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${userBase}$`),
			respond: () => ok(),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, false, allText(outcome));
	assert.deepEqual(deleteCalls(calls), [`${userBase}/versions/42`, userBase]);
});

// ---------------------------------------------------------------------------
// REQUIRED BRANCH 2: other versions present → plain version delete
// ---------------------------------------------------------------------------

test("when other runs' versions are still present, the version delete goes straight through", () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () =>
				ok([rawVersion('42', [RUN_TAG]), rawVersion('43', ['777-2'])]),
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(rawVersion('42', [RUN_TAG])),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, false, allText(outcome));
	// Exactly one DELETE, of the version; no package delete, no safety re-list
	// (the 400 branch was never entered).
	assert.deepEqual(deleteCalls(calls), [`${BASE}/versions/42`]);
	assert.equal(
		calls.filter((call) =>
			call.args.some((arg) => arg.endsWith('/versions?per_page=100')),
		).length,
		1,
	);
	assert.match(allText(outcome), /Deleted GHCR version 42/);
});

// ---------------------------------------------------------------------------
// REQUIRED BRANCH 3: concurrent tag between list and delete → SKIP
// ---------------------------------------------------------------------------

test('a concurrent tag appearing between the list and the re-read SKIPS the delete', () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('42', [RUN_TAG])]),
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(rawVersion('42', [RUN_TAG, '888-3'])),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, false, allText(outcome));
	assert.deepEqual(deleteCalls(calls), []);
	assert.match(allText(outcome), /Skipping GHCR version 42/);
	assert.match(allText(outcome), /shares the version with other run tags/);
});

test("this run's tag vanishing between the list and the re-read also skips the delete", () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('42', [RUN_TAG])]),
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(rawVersion('42', ['someone-else'])),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, false, allText(outcome));
	assert.deepEqual(deleteCalls(calls), []);
	assert.match(allText(outcome), /no longer on the version/);
});

// ---------------------------------------------------------------------------
// REQUIRED BRANCH 4: HTTP 403 → loud failure
// ---------------------------------------------------------------------------

test('an HTTP 403 on the version delete fails LOUDLY with the exact API message', () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('42', [RUN_TAG])]),
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(rawVersion('42', [RUN_TAG])),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () =>
				httpFail(403, 'gh: HTTP 403: Resource not accessible by integration'),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, true);
	const errors = textsAtLevel(outcome, 'error').join('\n');

	assert.match(errors, /Resource not accessible by integration/);
	assert.match(errors, /Manage Actions access/);
	assert.deepEqual(deleteCalls(calls), [`${BASE}/versions/42`]);
});

test('an HTTP 403 on the PACKAGE delete also fails loudly with the grant guidance', () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('42', [RUN_TAG])]),
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(rawVersion('42', [RUN_TAG])),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: (attempt) =>
				attempt === 0 ? lastTaggedRejection() : httpFail(500, 'no retry'),
		},
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('42', [RUN_TAG])]),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${BASE}$`),
			respond: () =>
				httpFail(403, 'gh: HTTP 403: Must have admin rights to this package.'),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, true);
	const errors = textsAtLevel(outcome, 'error').join('\n');

	assert.match(errors, /Must have admin rights/);
	assert.match(errors, /broken check/);
	// No suppression: the package delete was attempted exactly once and its
	// failure propagated.
	assert.deepEqual(deleteCalls(calls), [`${BASE}/versions/42`, BASE]);
});

// ---------------------------------------------------------------------------
// Race guard around the package-delete branch
// ---------------------------------------------------------------------------

test('a concurrent version arriving before the safety re-list falls back to the version delete', () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			// Attempt 0: the initial list. Attempt 1: the safety re-list, which
			// now shows a concurrent run's version alongside ours.
			respond: (attempt) =>
				ok(
					attempt === 0
						? [rawVersion('42', [RUN_TAG])]
						: [rawVersion('42', [RUN_TAG]), rawVersion('50', ['888-3'])],
				),
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(rawVersion('42', [RUN_TAG])),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: (attempt) => (attempt === 0 ? lastTaggedRejection() : ok()),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, false, allText(outcome));
	// Version delete attempted twice (first rejected, retried after the
	// fallback), and the PACKAGE was NEVER deleted.
	assert.deepEqual(deleteCalls(calls), [
		`${BASE}/versions/42`,
		`${BASE}/versions/42`,
	]);
	assert.match(allText(outcome), /Skipping the package delete/);
	assert.match(allText(outcome), /after the concurrent-activity fallback/);
});

test('the safety re-list failing after the documented 400 fails loudly instead of deleting blind', () => {
	let lists = 0;
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () => {
				lists += 1;

				if (lists === 1) {
					return ok([rawVersion('42', [RUN_TAG])]);
				}
				return httpFail(500, 'gh: HTTP 500: oh no');
			},
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(rawVersion('42', [RUN_TAG])),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: (attempt) =>
				attempt === 0 ? lastTaggedRejection() : httpFail(500, 'no retry'),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, true);
	assert.match(allText(outcome), /safety re-list failed/);
	// The package delete must never be aimed anywhere without its guard.
	assert.deepEqual(deleteCalls(calls), [`${BASE}/versions/42`]);
});

test('the fallback retry being refused again surfaces as a loud failure, not a loop', () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: (attempt) =>
				ok(
					attempt === 0
						? [rawVersion('42', [RUN_TAG])]
						: [rawVersion('42', [RUN_TAG]), rawVersion('50', ['888-3'])],
				),
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => ok(rawVersion('42', [RUN_TAG])),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => lastTaggedRejection(),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, true);
	assert.equal(deleteCalls(calls).length, 2);
	assert.match(
		textsAtLevel(outcome, 'error').join('\n'),
		/Could not delete GHCR version 42/,
	);
});

// ---------------------------------------------------------------------------
// Scope derivation and short-circuits
// ---------------------------------------------------------------------------

test('a fork run makes ZERO registry calls', () => {
	const { ghApi, calls } = makeGhApi([]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		forkRun: true,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, false);
	assert.deepEqual(calls, []);
	assert.match(allText(outcome), /Fork run/);
});

test('a run without an image tag warns and makes ZERO registry calls', () => {
	const { ghApi, calls } = makeGhApi([]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: '',
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, false);
	assert.deepEqual(calls, []);
	assert.match(
		textsAtLevel(outcome, 'warning').join('\n'),
		/did not emit an image tag/,
	);
});

test('an unrecognized owner type refuses to guess between /orgs/ and /user/', () => {
	const { ghApi, calls } = makeGhApi([ownerRoute('Bot')]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, true);
	assert.deepEqual(deleteCalls(calls), []);
	assert.match(allText(outcome), /refusing to guess/);
});

test('a failing owner lookup fails closed before aiming any delete', () => {
	const { ghApi, calls } = makeGhApi([
		{
			pattern: new RegExp(`^/users/${ORG}$`),
			respond: () => httpFail(403, 'gh: Bad credentials'),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, true);
	assert.deepEqual(deleteCalls(calls), []);
	assert.match(allText(outcome), /Could not resolve the GHCR package scope/);
	assert.match(allText(outcome), /Bad credentials/);
});

test("when nothing carries this run's tag there is nothing to delete and nothing fails", () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('43', ['777-2'])]),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, false, allText(outcome));
	assert.deepEqual(deleteCalls(calls), []);
});

// ---------------------------------------------------------------------------
// Strict parsing boundaries
// ---------------------------------------------------------------------------

test('an unparseable version list fails loudly instead of fabricating "nothing to delete"', () => {
	for (const payload of [
		'<html>gateway</html>',
		'[{"metadata":{}}]',
		'[null]',
	]) {
		const { ghApi, calls } = makeGhApi([
			ownerRoute('Organization'),
			{
				pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
				respond: () => ok(payload),
			},
		]);

		const outcome = runE2ECleanup({
			owner: ORG,
			runTag: RUN_TAG,
			packages: [PKG],
			ghApi,
		});

		assert.equal(outcome.failed, true, payload);
		assert.match(allText(outcome), /Could not parse GHCR version list/);
		assert.deepEqual(deleteCalls(calls), []);
	}
});

test('a failing re-read of one version skips its delete and fails loudly', () => {
	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		{
			pattern: new RegExp(`^${BASE}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('42', [RUN_TAG])]),
		},
		{
			pattern: new RegExp(`^${BASE}/versions/42$`),
			respond: () => httpFail(404, 'gh: HTTP 404: Not Found'),
		},
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: [PKG],
		ghApi,
	});

	assert.equal(outcome.failed, true);
	assert.match(allText(outcome), /Could not re-read GHCR version 42/);
	assert.deepEqual(deleteCalls(calls), []);
});

test('one package failing loudly does not stop the other packages from being cleaned', () => {
	const migrateBase = `/orgs/${ORG}/packages/container/publyapp-e2e-migrate`;
	const versionRoutes = (
		base: string,
		deleteAnswer: (attempt: number) => GhApiResult,
	): Route[] => [
		{
			pattern: new RegExp(`^${base}/versions\\?per_page=100$`),
			respond: () => ok([rawVersion('7', [RUN_TAG])]),
		},
		{
			pattern: new RegExp(`^${base}/versions/7$`),
			respond: () => ok(rawVersion('7', [RUN_TAG])),
		},
		{
			method: 'DELETE',
			pattern: new RegExp(`^${base}/versions/7$`),
			respond: deleteAnswer,
		},
	];

	const { ghApi, calls } = makeGhApi([
		ownerRoute('Organization'),
		...versionRoutes(migrateBase, () => httpFail(403, 'gh: HTTP 403: nope')),
		...versionRoutes(BASE, () => ok()),
	]);

	const outcome = runE2ECleanup({
		owner: ORG,
		runTag: RUN_TAG,
		packages: ['publyapp-e2e-migrate', PKG],
		ghApi,
	});

	assert.equal(outcome.failed, true);
	const deleteUrls = deleteCalls(calls);

	assert.deepEqual(deleteUrls, [
		`${migrateBase}/versions/7`,
		`${BASE}/versions/7`,
	]);
	assert.match(allText(outcome), /publyapp-e2e-migrate/);
	assert.match(allText(outcome), /Deleted GHCR version 7/);
});

test('the default package list covers all four e2e scratch packages', () => {
	assert.deepEqual(E2E_PACKAGES, [
		'publyapp-e2e-migrate',
		'publyapp-e2e-api',
		'publyapp-e2e-request-counter',
		'publyapp-e2e-front',
	]);
});

// ---------------------------------------------------------------------------
// Pure decisions and parsers
// ---------------------------------------------------------------------------

test('isLastTaggedVersionRejection matches ONLY the exact documented refusal', () => {
	assert.equal(isLastTaggedVersionRejection(lastTaggedRejection()), true);
	assert.equal(
		isLastTaggedVersionRejection(
			httpFail(403, `gh: HTTP 403: ${LAST_TAGGED_VERSION_400_MESSAGE}`),
		),
		true,
	);
	assert.equal(
		isLastTaggedVersionRejection(httpFail(403, 'Resource not accessible')),
		false,
	);
	assert.equal(isLastTaggedVersionRejection(ok([rawVersion('42', [])])), false);
	assert.equal(isLastTaggedVersionRejection(httpFail(404, 'Not Found')), false);
});

test('parseVersionsJson accepts the documented shapes and rejects everything else', () => {
	const parsed = parseVersionsJson(
		JSON.stringify([rawVersion('42', ['a']), rawVersion(7, [1, 'b', 2])]),
	);

	assert.deepEqual(parsed, [
		{ id: '42', tags: ['a'] },
		{ id: '7', tags: ['b'] },
	] satisfies ContainerVersion[]);

	for (const bad of [
		'',
		'not json',
		'{}',
		'null',
		'[{"metadata":{}}]',
		'[7]',
		'[null]',
	]) {
		assert.equal(parseVersionsJson(bad), undefined, bad);
	}

	assert.deepEqual(parseVersionsJson('[{"id":"9","metadata":{}}]'), [
		{ id: '9', tags: [] },
	]);
});

test('parseVersionJson wraps a single version GET and refuses garbage', () => {
	assert.deepEqual(
		parseVersionJson(JSON.stringify(rawVersion('42', [RUN_TAG]))),
		{ id: '42', tags: [RUN_TAG] },
	);
	assert.equal(parseVersionJson('<html/>'), undefined);
});

test('decideVersionDeletion deletes only exclusively-tagged versions', () => {
	assert.deepEqual(
		decideVersionDeletion({ versionTags: [RUN_TAG], runTag: RUN_TAG }),
		{ outcome: 'proceed' },
	);

	const shared = decideVersionDeletion({
		versionTags: [RUN_TAG, '888-3'],
		runTag: RUN_TAG,
	});

	assert.equal(shared.outcome, 'skip');
	assert.match(
		shared.outcome === 'skip' ? shared.reason : '',
		/shares the version with other run tags/,
	);

	const gone = decideVersionDeletion({ versionTags: [], runTag: RUN_TAG });

	assert.equal(gone.outcome, 'skip');
	assert.match(
		gone.outcome === 'skip' ? gone.reason : '',
		/no longer on the version/,
	);
});

test("decidePackageDeletion allows the package delete ONLY for exactly {this run's version}", () => {
	assert.deepEqual(
		decidePackageDeletion({
			versions: [{ id: '42', tags: [RUN_TAG] }],
			expectedVersionId: '42',
			runTag: RUN_TAG,
		}),
		{ outcome: 'delete-package' },
	);

	const fallbacks: ContainerVersion[][] = [
		[],
		[
			{ id: '42', tags: [RUN_TAG] },
			{ id: '50', tags: ['888-3'] },
		],
		[{ id: '50', tags: [RUN_TAG] }],
		[{ id: '42', tags: [] }],
		[{ id: '42', tags: [RUN_TAG, '888-3'] }],
	];

	for (const versions of fallbacks) {
		const decision = decidePackageDeletion({
			versions,
			expectedVersionId: '42',
			runTag: RUN_TAG,
		});

		assert.equal(
			decision.outcome,
			'fallback-to-version-delete',
			JSON.stringify(versions),
		);
		assert.match(
			decision.outcome === 'fallback-to-version-delete' ? decision.reason : '',
			/no longer/,
		);
	}
});

// ---------------------------------------------------------------------------
// Direct-run CLI boundary (fake `gh` binary on PATH, like ci-changed-paths)
// ---------------------------------------------------------------------------

const CLI_SCRIPT = fileURLToPath(
	new URL('./ci-e2e-cleanup.ts', import.meta.url),
);

const withFakeGh = (body: string, fn: (dir: string) => void): void => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'publyapp-fake-gh-'));

	try {
		const gh = path.join(dir, 'gh');
		writeFileSync(gh, body);
		chmodSync(gh, 0o755);
		fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

// Answers every invocation with a loud failure: if the script under test
// invokes gh at all in a scenario that must not, the nonzero exit propagates.
const FAILING_GH = [
	'#!/usr/bin/env node',
	"process.stderr.write('gh: HTTP 403: forbidden-by-test-fake\\n');",
	'process.exit(3);',
	'',
].join('\n');

const runCli = (extraEnv: Record<string, string>, fakeGhDir: string) =>
	spawnSync(process.execPath, [CLI_SCRIPT], {
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${fakeGhDir}:${process.env.PATH ?? ''}`,
			GH_TOKEN: 'fake-token-for-tests',
			GITHUB_REPOSITORY: `${ORG}/publyapp`,
			...extraEnv,
		},
	});

test('direct run: a fork run exits 0 with the fork notice and never invokes gh', () => {
	withFakeGh(FAILING_GH, (dir) => {
		const result = runCli(
			{
				GITHUB_REPOSITORY_OWNER: ORG,
				E2E_IMAGE_TAG: RUN_TAG,
				FORK_RUN: 'true',
			},
			dir,
		);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /::notice::Fork run/);
	});
});

test('direct run: an empty GITHUB_REPOSITORY_OWNER refuses to aim deletes and exits 1', () => {
	withFakeGh(FAILING_GH, (dir) => {
		const result = runCli(
			{
				GITHUB_REPOSITORY_OWNER: '',
				E2E_IMAGE_TAG: RUN_TAG,
				FORK_RUN: 'false',
			},
			dir,
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /::error::GITHUB_REPOSITORY_OWNER is empty/);
	});
});

test('direct run: a failing gh surfaces as ::error:: on stderr and exit 1', () => {
	withFakeGh(FAILING_GH, (dir) => {
		const result = runCli(
			{
				GITHUB_REPOSITORY_OWNER: ORG,
				E2E_IMAGE_TAG: RUN_TAG,
				FORK_RUN: 'false',
			},
			dir,
		);

		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/::error::Could not resolve the GHCR package scope/,
		);
		assert.match(result.stderr, /forbidden-by-test-fake/);
	});
});

test('direct run: a successful cleanup emits ::notice:: lines and exits 0', () => {
	const script = [
		'#!/usr/bin/env node',
		'const [cmd, ...rest] = process.argv.slice(2);',
		"if (cmd !== 'api') process.exit(64);",
		"const url = rest.find((a) => a.startsWith('/')) ?? '';",
		'if (/^\\/users\\//.test(url)) {',
		"  process.stdout.write(JSON.stringify({ type: 'Organization' }));",
		'  process.exit(0);',
		'}',
		// Every DELETE of a single version gets the documented
		// last-tagged-version refusal; the PACKAGE delete succeeds.
		"if (rest[0] === '--method') {",
		"  if (url.endsWith('/versions/42')) {",
		"    process.stderr.write('gh: HTTP 400: You cannot delete the last tagged version of a package. You must delete the package instead.\\n');",
		'    process.exit(1);',
		'  }',
		'  process.exit(0);',
		'}',
		"if (url.endsWith('/versions?per_page=100')) {",
		'  process.stdout.write(JSON.stringify([{ id: "42", metadata: { container: { tags: ["999-1"] } } }]));',
		'  process.exit(0);',
		'}',
		'if (/\\/versions\\/42$/.test(url)) {',
		'  process.stdout.write(JSON.stringify({ id: "42", metadata: { container: { tags: ["999-1"] } } }));',
		'  process.exit(0);',
		'}',
		'process.exit(64);',
		'',
	].join('\n');

	withFakeGh(script, (dir) => {
		const result = runCli(
			{
				GITHUB_REPOSITORY_OWNER: ORG,
				E2E_IMAGE_TAG: RUN_TAG,
				FORK_RUN: 'false',
			},
			dir,
		);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /::notice::Deleted GHCR package/);
	});
});

// ---------------------------------------------------------------------------
// The real gh runner: nonzero exits are DATA, never exceptions
// ---------------------------------------------------------------------------

test('execFileGhApi passes stdout through on exit 0', () => {
	withFakeGh(
		[
			'#!/usr/bin/env node',
			'process.stdout.write(\'{"type":"Organization"}\');',
			'',
		].join('\n'),
		(dir) => {
			const result = spawnSync(
				process.execPath,
				[
					'-e',
					`
					import { execFileGhApi } from ${JSON.stringify(CLI_SCRIPT)};
					const r = execFileGhApi(['/users/x']);
					process.stdout.write(JSON.stringify(r));
					`,
				],
				{
					encoding: 'utf8',
					env: {
						...process.env,
						PATH: `${dir}:${process.env.PATH ?? ''}`,
					},
				},
			);

			assert.equal(result.status, 0, result.stderr);
			assert.deepEqual(JSON.parse(result.stdout), {
				status: 0,
				stdout: '{"type":"Organization"}',
				stderr: '',
			});
		},
	);
});

test('execFileGhApi maps a nonzero exit to {status, stderr} data without throwing', () => {
	withFakeGh(FAILING_GH, (dir) => {
		const result = spawnSync(
			process.execPath,
			[
				'-e',
				`
				import { execFileGhApi } from ${JSON.stringify(CLI_SCRIPT)};
				const r = execFileGhApi(['/users/x']);
				process.stdout.write(JSON.stringify(r));
				`,
			],
			{
				encoding: 'utf8',
				env: {
					...process.env,
					PATH: `${dir}:${process.env.PATH ?? ''}`,
				},
			},
		);

		assert.equal(result.status, 0, result.stderr);
		const parsed = JSON.parse(result.stdout) as GhApiResult;

		assert.equal(parsed.status, 3);
		assert.match(parsed.stderr, /forbidden-by-test-fake/);
	});
});
