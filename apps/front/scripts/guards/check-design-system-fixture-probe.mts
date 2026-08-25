import { writeFile } from 'node:fs/promises';
import test, { after } from 'node:test';

import {
	cleanupFixtures,
	getFixtureParentPath,
	makeFixture,
	registerFixtureSignalHandlers,
} from './check-design-system-fixtures.mts';

const mode = process.env.FRONT2_DESIGN_GUARD_FIXTURE_PROBE;
registerFixtureSignalHandlers();

test('fixture probe creates one owned parent', async () => {
	await makeFixture({
		'probe.ts': 'export const probe = true;',
	});
	const parent = await getFixtureParentPath();
	const parentReportPath = process.env.FRONT2_DESIGN_GUARD_PARENT_REPORT;
	if (parentReportPath === undefined) {
		throw new Error(
			'FRONT2_DESIGN_GUARD_PARENT_REPORT must be set for the fixture probe',
		);
	}
	await writeFile(parentReportPath, parent);
	if (mode === 'error') {
		throw new Error('fixture cleanup probe failure');
	}
	setInterval(() => {}, 1_000);
	await new Promise(() => {});
});

after(cleanupFixtures);
