import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const fixtureParentPrefix = 'front2-design-guard-';
let fixtureParentPromise;
const ownedFixtureRoots = new Set();
let cleanupPromise;
let signalCleanupStarted = false;

const getFixtureParent = () => {
	if (fixtureParentPromise === undefined) {
		fixtureParentPromise = mkdtemp(path.join(os.tmpdir(), fixtureParentPrefix));
	}
	return fixtureParentPromise;
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

export const cleanupFixtures = async () => {
	if (cleanupPromise === undefined) {
		cleanupPromise = (async () => {
			if (fixtureParentPromise !== undefined) {
				const parent = await fixtureParentPromise;
				const delay = Number(process.env.FRONT2_DESIGN_GUARD_CLEANUP_DELAY_MS);
				if (Number.isFinite(delay) && delay > 0) {
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
				await rm(parent, { recursive: true, force: true });
			}
			ownedFixtureRoots.clear();
		})();
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
