import { describe, expect, test } from 'vitest';

import {
	cronText,
	DEAD_LETTER_STATE_LABEL,
	deadLetterState,
	JOB_FAMILY_ORDER,
	jobDescription,
	jobLabel,
	jobOf,
} from './_job-catalogue';

const t = (key: string, options?: Record<string, unknown>): string => {
	if (!options) {
		return key;
	}
	return `${key}:${Object.values(options).join(',')}`;
};

describe('job catalogue', () => {
	test('maps a known key to its label, description and family', () => {
		const key = 'publishing.publish-publication.v1';
		expect(jobLabel(t, key)).toBe(
			'staff-jobs:jobs-job-publish-publication-label',
		);
		expect(jobDescription(t, key)).toBe(
			'staff-jobs:jobs-job-publish-publication-description',
		);
		expect(jobOf(key).family).toBe('publishing');
	});

	test('an unknown key is its own label, in Maintenance, with no description', () => {
		expect(jobLabel(t, 'custom.unknown.v1')).toBe('custom.unknown.v1');
		expect(jobDescription(t, 'custom.unknown.v1')).toBe('');
		expect(jobOf('custom.unknown.v1').family).toBe('maintenance');
	});

	test('every family has a label', () => {
		for (const family of JOB_FAMILY_ORDER) {
			expect(jobOf('session-cleanup').family).toBe('maintenance');
			expect(DEAD_LETTER_STATE_LABEL.open).toBe(
				'staff-jobs:jobs-dead-state-open',
			);
			expect(family).toBeTruthy();
		}
	});
});

describe('cronText', () => {
	test('renders the Quartz cadences as sentences', () => {
		expect(cronText(t, '0 * * * * ?')).toBe(
			'staff-jobs:jobs-cron-every-minute',
		);
		expect(cronText(t, '0 0/10 * * * ?')).toBe(
			'staff-jobs:jobs-cron-every-n-minutes:10',
		);
		expect(cronText(t, '0 */15 * * * ?')).toBe(
			'staff-jobs:jobs-cron-every-n-minutes:15',
		);
		expect(cronText(t, '0 20 * * * ?')).toBe(
			'staff-jobs:jobs-cron-hourly-at:20',
		);
		expect(cronText(t, '0 0 3 * * ?')).toBe('staff-jobs:jobs-cron-daily:3');
		expect(cronText(t, '0 30 3 * * ?')).toBe(
			'staff-jobs:jobs-cron-daily-at:3,30',
		);
	});

	test('a malformed or empty expression is shown as-is, never invented', () => {
		expect(cronText(t, 'nonsense')).toBe('nonsense');
		expect(cronText(t, null)).toBe('common:no-value');
	});
});

describe('deadLetterState', () => {
	test('requeued wins over triaged, then timed triage, then open', () => {
		const now = new Date('2026-10-27T10:00:00Z');
		expect(deadLetterState({ requeuedAsJobId: 'job-1', triagedAt: now })).toBe(
			'requeued',
		);
		expect(deadLetterState({ requeuedAsJobId: null, triagedAt: now })).toBe(
			'triaged',
		);
		expect(deadLetterState({ requeuedAsJobId: null, triagedAt: null })).toBe(
			'open',
		);
	});
});
