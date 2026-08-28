/** @vitest-environment jsdom */
import { describe, expect, test } from 'vitest';

import { makeQueueColumns } from './_columns';
import {
	externalStateStatusLabel,
	externalStateStatusTone,
	queueStatusLabel,
	queueStatusTone,
} from './_jobs-status';
import { isPayloadRedacted } from './_redaction-banner';

const t = (key: string): string => key;

describe('queue status presentation', () => {
	test('maps wire statuses to label keys and tones', () => {
		expect(queueStatusLabel(t, 'pending')).toBe('queue-status-pending');
		expect(queueStatusTone('processing')).toBe('warning');
		expect(queueStatusTone('failed')).toBe('danger');
	});

	test('falls back to the raw wire value for an unknown status', () => {
		expect(queueStatusLabel(t, 'mystery')).toBe('mystery');
		expect(queueStatusTone('mystery')).toBe('neutral');
		expect(queueStatusLabel(t, null)).toBe('-');
	});
});

describe('external state status presentation', () => {
	test('mirrors the ExternalStateStatus enum values', () => {
		expect(externalStateStatusLabel(t, 3)).toBe('dl-state-never-prepared');
		expect(externalStateStatusLabel(t, 6)).toBe('dl-state-unclassified');
		expect(externalStateStatusTone(6)).toBe('warning');
	});

	test('handles out-of-range and missing values without crashing', () => {
		expect(externalStateStatusLabel(t, 99)).toBe('dl-state-unknown');
		expect(externalStateStatusLabel(t, null)).toBe('-');
		expect(externalStateStatusTone(undefined)).toBe('neutral');
	});
});

describe('isPayloadRedacted', () => {
	test('detects the fail-closed redaction envelope', () => {
		expect(isPayloadRedacted('{"redacted":true,"keys":["note"]}')).toBe(true);
	});

	test('treats readable payloads, junk, and empties as not redacted', () => {
		expect(isPayloadRedacted('{"postId":"abc"}')).toBe(false);
		expect(isPayloadRedacted('{"redacted":false}')).toBe(false);
		expect(isPayloadRedacted('not json at all')).toBe(false);
		expect(isPayloadRedacted(null)).toBe(false);
		expect(isPayloadRedacted('')).toBe(false);
	});
});

describe('makeQueueColumns', () => {
	test('exposes the contract-backed column set with widths and hidden-below breakpoints', () => {
		const columns = makeQueueColumns(t, 'en', () => {});

		const metaById = Object.fromEntries(
			columns.map((column) => [
				column.id,
				{
					width: column.meta?.width,
					hideBelow: column.meta?.hideBelow,
				},
			]),
		);

		expect(Object.keys(metaById)).toEqual([
			'job_type',
			'status',
			'attempts',
			'tenant_id',
			'next_attempt_at',
			'actions',
		]);
		expect(metaById.job_type).toEqual({ width: '240px', hideBelow: undefined });
		expect(metaById.attempts).toEqual({ width: '100px', hideBelow: 768 });
		expect(metaById.tenant_id).toEqual({ width: '180px', hideBelow: 1024 });
	});
});
