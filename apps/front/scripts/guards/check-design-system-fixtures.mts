import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ownedRootPrefix = 'front2-design-guard-run-';
let ownedRootPromise;
let fixtureParentPromise;
const ownedFixtureRoots = new Set();
let cleanupPromise;
let signalCleanupStarted = false;

const getFixtureParent = () => {
	if (fixtureParentPromise === undefined) {
		fixtureParentPromise = getOwnedRoot().then((root) =>
			mkdtemp(path.join(root, 'fixture-parent-')),
		);
	}
	return fixtureParentPromise;
};

const getOwnedRoot = () => {
	if (ownedRootPromise === undefined) {
		ownedRootPromise = mkdtemp(path.join(os.tmpdir(), ownedRootPrefix));
	}
	return ownedRootPromise;
};

export const getOwnedRootPath = async () => getOwnedRoot();

export const makeOwnedTempDirectory = async (prefix) => {
	const root = await getOwnedRoot();
	return mkdtemp(path.join(root, `${prefix}-`));
};

export const getFixtureParentPath = async () => getFixtureParent();

export const makeFixture = async (files) => {
	const parent = await getFixtureParent();
	const root = await mkdtemp(path.join(parent, 'fixture-'));
	ownedFixtureRoots.add(root);
	for (const [relativePath, content] of Object.entries(files)) {
		const absolutePath = path.join(root, relativePath);
		await mkdir(path.dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, content);
	}
	return root;
};

const runFixtureCleanup = async () => {
	if (ownedRootPromise !== undefined) {
		const root = await ownedRootPromise;
		const delay = Number(process.env.FRONT2_DESIGN_GUARD_CLEANUP_DELAY_MS);
		if (Number.isFinite(delay) && delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
		await rm(root, { recursive: true, force: true });
	}
	ownedFixtureRoots.clear();
};

export const cleanupFixtures = async () => {
	if (cleanupPromise === undefined) {
		cleanupPromise = runFixtureCleanup();
	}
	return cleanupPromise;
};

export const registerFixtureSignalHandlers = () => {
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => {
			if (signalCleanupStarted) {
				return;
			}
			signalCleanupStarted = true;
			void cleanupFixtures()
				.catch(() => {})
				.finally(() => {
					process.exit(signal === 'SIGINT' ? 130 : 143);
				});
		});
	}
};
