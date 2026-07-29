import { describe, expect, test } from 'vitest';

import { statusPillTone } from './status-tone';

const CASES = [
	['active', 'success'],
	['Active', 'success'],
	['accepted', 'success'],
	['invited', 'info'],
	['sent', 'info'],
	['suspended', 'danger'],
	['expired', 'danger'],
	['revoked', 'danger'],
	['deleted', 'danger'],
	['globallysuspended', 'danger'],
	['globally_suspended', 'danger'],
	['pending', 'warning'],
	['pending_activation', 'warning'],
	['something-else', 'neutral'],
	[null, 'neutral'],
] as const;

describe('statusPillTone', () => {
	test.each(CASES)('maps %s to %s', (status, tone) => {
		expect(statusPillTone(status)).toBe(tone);
	});
});
