/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import { nextPollingDelayMs } from './_scheduled-publication-helpers';

const ROW = (
	status: string | null,
	scheduledAtUtc: Date,
	overrides: Partial<ScheduledPublicationRow> = {},
): ScheduledPublicationRow => ({
	id: overrides.id ?? 'row',
	publicationId: overrides.publicationId ?? 'row',
	postId: overrides.postId ?? 'post',
	postBodyPreview: overrides.postBodyPreview ?? 'preview',
	accountDisplayHandle: overrides.accountDisplayHandle ?? '@publy.example',
	status,
	postStatus: overrides.postStatus ?? 'scheduled',
	scheduledAtUtc,
	scheduledAtLocal: overrides.scheduledAtLocal ?? '2026-08-31T20:30:00+02:00',
	timeZone: overrides.timeZone ?? 'Europe/Paris',
});

describe('nextPollingDelayMs', () => {
	const ACTIVE_POLL_MS = 5_000;
	const NOW = new Date('2026-08-31T18:00:00.000Z');

	test('polls every 5s while a publication is in progress', () => {
		const rows = [ROW('in_progress', new Date('2026-08-31T17:30:00.000Z'))];

		expect(nextPollingDelayMs({ rows, now: NOW })).toBe(ACTIVE_POLL_MS);
	});

	test('waits until the next scheduled due instant when no row is in progress', () => {
		const dueAt = new Date(NOW.valueOf() + 12 * 60 * 1000);
		const rows = [ROW('scheduled', dueAt)];

		expect(nextPollingDelayMs({ rows, now: NOW })).toBe(12 * 60 * 1000);
	});

	test('rechecks daily when the next scheduled instant exceeds the browser timer limit', () => {
		const dueAt = new Date(NOW.valueOf() + 31 * 24 * 60 * 60 * 1000);
		const rows = [ROW('scheduled', dueAt)];

		expect(nextPollingDelayMs({ rows, now: NOW })).toBe(24 * 60 * 60 * 1000);
	});

	test('falls back to the active poll cadence when a scheduled instant is already due', () => {
		const pastDue = new Date(NOW.valueOf() - 30 * 1000);
		const rows = [ROW('scheduled', pastDue)];

		expect(nextPollingDelayMs({ rows, now: NOW })).toBe(ACTIVE_POLL_MS);
	});

	test('returns null (stop polling) when no in-progress or scheduled row remains', () => {
		const rows = [ROW('paused', new Date('2026-09-01T18:30:00.000Z'))];

		expect(nextPollingDelayMs({ rows, now: NOW })).toBeNull();
	});

	test('returns null when the page is empty', () => {
		expect(nextPollingDelayMs({ rows: [], now: NOW })).toBeNull();
	});

	test('prefers the soonest scheduled instant across multiple rows', () => {
		const later = new Date(NOW.valueOf() + 30 * 60 * 1000);
		const sooner = new Date(NOW.valueOf() + 5 * 60 * 1000);
		const rows = [
			ROW('scheduled', later, { id: 'later' }),
			ROW('scheduled', sooner, { id: 'sooner' }),
		];

		expect(nextPollingDelayMs({ rows, now: NOW })).toBe(5 * 60 * 1000);
	});

	test('treats a row in progress as faster than a future scheduled row', () => {
		const future = new Date(NOW.valueOf() + 60 * 60 * 1000);
		const rows = [ROW('scheduled', future), ROW('in_progress', NOW)];

		expect(nextPollingDelayMs({ rows, now: NOW })).toBe(ACTIVE_POLL_MS);
	});

	test('ignores paused rows when computing the next due instant', () => {
		const dueAt = new Date(NOW.valueOf() + 7 * 60 * 1000);
		const rows = [
			ROW('paused', new Date('2026-09-01T18:30:00.000Z'), { id: 'paused' }),
			ROW('scheduled', dueAt, { id: 'scheduled' }),
		];

		expect(nextPollingDelayMs({ rows, now: NOW })).toBe(7 * 60 * 1000);
	});
});
