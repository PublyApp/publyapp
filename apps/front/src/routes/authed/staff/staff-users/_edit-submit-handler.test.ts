import { describe, expect, test } from 'vitest';

import { computeActionBarStatus } from './_edit-submit-handler';

describe('computeActionBarStatus', () => {
	const t = (key: string, opts?: Record<string, unknown>) => {
		if (key === 'common:unsaved-changes') {
			return 'Unsaved changes';
		}
		if (key === 'staff-users:fields-need-attention') {
			return `${opts?.count ?? 0} fields need attention`;
		}
		return key;
	};

	test('returns undefined when not dirty', () => {
		expect(computeActionBarStatus(false, 0, t)).toBeUndefined();
	});

	test('returns unsaved changes when dirty with no errors', () => {
		expect(computeActionBarStatus(true, 0, t)).toBe('Unsaved changes');
	});

	test('returns combined message when dirty with errors', () => {
		const result = computeActionBarStatus(true, 3, t);
		expect(result).toBe('Unsaved changes · 3 fields need attention');
	});
});
