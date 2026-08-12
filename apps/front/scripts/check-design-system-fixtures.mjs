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
				await rm(parent, { recursive: true, force: true });
			}
			ownedFixtureRoots.clear();
		})();
	}
	return cleanupPromise;
};

export const registerFixtureSignalHandlers = () => {
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.once(signal, () => {
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

const probeMode = process.env.FRONT2_DESIGN_GUARD_FIXTURE_PROBE;
if (
	probeMode === 'error' ||
	probeMode === 'SIGINT' ||
	probeMode === 'SIGTERM'
) {
	registerFixtureSignalHandlers();
	try {
		const root = await makeFixture({
			'probe.ts': 'export const probe = true;',
		});
		process.stdout.write(`FIXTURE_DIRECTORY=${root}\n`);
		if (probeMode === 'error') {
			throw new Error('fixture cleanup probe failure');
		}
		setInterval(() => {}, 1_000);
		await new Promise(() => {});
	} catch {
		await cleanupFixtures();
		process.exitCode = 1;
	}
}
