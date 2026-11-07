import { describe, expect, it } from 'vitest';

import { shardTwoCommands } from './ci-e2e-playwright-shard.ts';

describe('ci-e2e-playwright-shard', () => {
	it('keeps the shard-2-only guards: setup project, both hermetic projects', () => {
		const commands = shardTwoCommands().map((args) => args.join(' '));

		expect(commands).toContain('test --project=setup --no-deps');
		expect(commands).toContain(
			'test --project=chromium-hermetic-counter --no-deps',
		);
		expect(commands).toContain(
			'test --project=chromium-hermetic-source --no-deps',
		);
	});
});
