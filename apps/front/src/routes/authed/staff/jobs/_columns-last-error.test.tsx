/**
 * @vitest-environment jsdom
 *
 * Brief #1720 ronde 2: the dead-letter list must show the failure cause on the
 * row (not only in the detail drawer). Four guarantees:
 *   1. a short cause is visible on the row;
 *   2. a very long cause is truncated at display AND the full text stays
 *      reachable (title attribute);
 *   3. a row with no cause shows the designated "no cause recorded" marker,
 *      distinct from an empty/legitimate cause;
 *   4. non-regression — existing columns are neither displaced nor broken.
 *
 * Ronde 2 additions:
 *   5. empty string AND whitespace-only cause show the marker (the old `??`
 *      form let these through as a blank cell);
 *   6. the title attribute is ABSENT when the cause is absent — a `title` on
 *      the marker would be redundant and misleading;
 *   7. column order is verified exactly (not just `toContain`), so a column
 *      displacement is caught.
 *
 * Each test renders the column builder the same way the production route does,
 * then asserts on the LINE — not the drawer — to avoid the dominant trap
 * (a second mechanism masking a missing line-level assertion).
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';

import { makeDeadLetterColumns } from './_columns-dead-letter';

const translations = {
	'common:column-last-error': 'Last error',
	'common:no-cause': 'No cause recorded',
	'common:no-value': '—',
} as const satisfies Record<string, string>;

// Track calls so mutations that hardcode a string (bypassing t()) are caught.
const tCalls: string[] = [];
const t = (key: string): string => {
	tCalls.push(key);
	if (key in translations) {
		return translations[key as keyof typeof translations];
	}

	return key;
};

const buildRow = (
	overrides: Partial<StaffDeadLetterRow> = {},
): StaffDeadLetterRow => ({
	id: 'dl-1',
	originalJobId: null,
	jobType: 'email.send',
	attempts: 3,
	lastError: 'boom',
	externalStateStatus: null,
	triagedAt: null,
	failedAt: null,
	requeuedAsJobId: null,
	requeuedAt: null,
	tenantId: null,
	...overrides,
});

const renderCell = (row: StaffDeadLetterRow) => {
	const onInspect = vi.fn();
	const onRequeue = vi.fn();
	const columns = makeDeadLetterColumns(t, 'en', onInspect, onRequeue);
	const column = columns.find((c) => c.id === 'last_error');
	expect(column).toBeDefined();
	const ui = (
		column!.cell as (ctx: {
			row: { original: StaffDeadLetterRow };
		}) => ReactElement
	)({ row: { original: row } });
	render(ui);
};

afterEach(() => {
	cleanup();
	tCalls.length = 0;
});

describe('dead-letter last_error column on the row (brief #1720)', () => {
	test('a short cause is visible on the row', () => {
		renderCell(buildRow({ lastError: 'Connection refused' }));

		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.textContent).toBe('Connection refused');
	});

	test('a very long cause is truncated at display AND the full text is reachable via title', () => {
		const longCause =
			'System.Net.Http.HttpRequestException: The socket connection was reset. ---> System.Net.Sockets.SocketException (104): Connection reset by peer at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.ThrowException(SocketError error, CancellationToken cancellationToken, EndPoint endPoint) at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.GetStatusResult(Int16 token, Int32& bytesTransferred, EndPoint& endPoint, SocketFlags& flags) at PublyApp.Infrastructure.Email.SmtpEmailSender.SendAsync(EmailMessage message, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Email.SendEmailJob.HandleAsync(JobContext context, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessAsync(JobQueueItem item, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessWithPolicyAsync(JobQueueItem item, CancellationToken cancellationToken)';

		renderCell(buildRow({ lastError: longCause }));

		const cell = screen.getByTestId('cell-last-error-dl-1');
		// The truncate class is applied for visual truncation.
		expect(cell.className).toContain('truncate');
		// The full cause remains reachable via the title attribute.
		expect(cell.getAttribute('title')).toBe(longCause);
	});

	test('a row without a cause shows the designated marker, distinct from an empty cause', () => {
		tCalls.length = 0;
		renderCell(buildRow({ lastError: null }));

		const cell = screen.getByTestId('cell-last-error-dl-1');
		// The marker is the translated "no-cause" string.
		expect(cell.textContent).toBe('No cause recorded');
		// It must NOT render as the dash (no-value) used for genuinely-empty fields.
		expect(cell.textContent).not.toBe('—');
		// t() must have been called with the key, not bypassed by a hardcoded literal
		expect(tCalls).toContain('common:no-cause');
	});

	test('ronde 2: an empty-string cause shows the marker, not a blank cell', () => {
		// RED before fix: the old `??` form let '' through, rendering a blank cell.
		tCalls.length = 0;
		renderCell(buildRow({ lastError: '' }));

		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.textContent).toBe('No cause recorded');
		expect(cell.textContent).not.toBe('');
		expect(tCalls).toContain('common:no-cause');
	});

	test('ronde 2: a whitespace-only cause shows the marker, not a blank cell', () => {
		// RED before fix: the old `??` form let '   ' through, rendering a blank cell.
		tCalls.length = 0;
		renderCell(buildRow({ lastError: '   ' }));

		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.textContent).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('ronde 2: the title attribute is absent when the cause is absent', () => {
		// A `title` on the marker would be redundant and misleading.
		renderCell(buildRow({ lastError: null }));

		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.getAttribute('title')).toBeNull();
	});

	test('non-regression: column order is preserved exactly (no displacement)', () => {
		const onInspect = vi.fn();
		const onRequeue = vi.fn();
		const columns = makeDeadLetterColumns(t, 'en', onInspect, onRequeue);
		const ids = columns.map((c) => c.id);

		// Exact order — not just `toContain`, which would miss a displacement.
		expect(ids).toEqual([
			'job_type',
			'external_state_status',
			'attempts',
			'failed_at',
			'last_error',
			'requeued_at',
			'actions',
		]);
	});

	test('Brief #1880: the no-cause marker is rendered via t("common:no-cause"), not a hardcoded literal', () => {
		// Map 'common:no-cause' to a NON-English control value. If the source
		// hardcodes the English 'No cause recorded' instead of calling t(), the
		// rendered text will be English — the assertion against the French label
		// fails, and the spy confirms t('common:no-cause') was actually called.
		const CAUSE_MARKER_FR = 'Aucune cause enregistrée';
		const t_fr = vi.fn((key: string): string => {
			if (key === 'common:no-cause') {
				return CAUSE_MARKER_FR;
			}

			return translations[key as keyof typeof translations] ?? key;
		});

		tCalls.length = 0;
		const onInspect = vi.fn();
		const onRequeue = vi.fn();
		const columns = makeDeadLetterColumns(t_fr, 'en', onInspect, onRequeue);
		const column = columns.find((c) => c.id === 'last_error');
		expect(column).toBeDefined();
		const ui = (
			column!.cell as (ctx: {
				row: { original: StaffDeadLetterRow };
			}) => ReactElement
		)({ row: { original: buildRow({ lastError: null }) } });
		render(ui);

		// The marker must be the French control value, NOT the English literal
		const cell = screen.getByTestId('cell-last-error-dl-1');
		expect(cell.textContent).toBe(CAUSE_MARKER_FR);
		// The English literal must NOT appear (that would mean hardcoding)
		expect(cell.textContent).not.toBe('No cause recorded');
		// The spy confirms t('common:no-cause') was actually called by the source
		expect(t_fr).toHaveBeenCalledWith('common:no-cause');
	});
});
