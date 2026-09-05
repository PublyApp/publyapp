/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';

import {
	buildUpcomingPublicationWindow,
	nextPollingDelayMs,
} from './_scheduled-publication-helpers';

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
	lastError: overrides.lastError ?? null,
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

describe('buildUpcomingPublicationWindow', () => {
	// API maximum window = 32 days (PublicationService.FindScheduledAsync). The
	// queue window must respect it: future horizon + past grace combined must
	// stay strictly <= 32 days so the server never 422s.
	const API_MAX_WINDOW_MS = 32 * 24 * 60 * 60 * 1_000;
	const PAST_GRACE_MS = 24 * 60 * 60 * 1_000;
	const NOW = new Date('2026-08-31T18:00:00.000Z');

	test('starts 24 hours in the past so a row due seconds before page open is visible', () => {
		const window = buildUpcomingPublicationWindow(NOW);

		// 24-hour past grace: a row due seconds before the page opens must fall
		// inside FromUtc so the API filter `ScheduledAtUtc >= FromUtc` keeps it;
		// 24h is bounded enough that old scheduled rows cannot bleed in.
		expect(NOW.valueOf() - window.from.valueOf()).toBe(PAST_GRACE_MS);
	});

	test('keeps the future horizon at 31 days so the window equals the 32-day API maximum', () => {
		const window = buildUpcomingPublicationWindow(NOW);

		const spanMs = window.to.valueOf() - window.from.valueOf();
		expect(spanMs).toBe(API_MAX_WINDOW_MS);
	});

	test('returns a fresh Date instance on each call so the caller can mutate it safely', () => {
		const first = buildUpcomingPublicationWindow(NOW);
		const second = buildUpcomingPublicationWindow(NOW);

		expect(first.from).not.toBe(second.from);
		expect(first.to).not.toBe(second.to);
	});
});
