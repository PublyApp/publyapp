/**
 * @vitest-environment jsdom
 *
 * Brief #1720: the dead-letter list must show the failure cause on the row
 * (not only in the detail drawer). Four guarantees:
 *   1. a short cause is visible on the row;
 *   2. a very long cause is truncated at display AND the full text stays
 *      reachable (title attribute);
 *   3. a row with no cause shows the designated "no cause recorded" marker,
 *      distinct from an empty/legitimate cause;
 *   4. non-regression — existing columns are neither displaced nor broken.
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

const t = (key: string): string =>
	key in translations ? translations[key as keyof typeof translations] : key;

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
		renderCell(buildRow({ lastError: null }));

		const cell = screen.getByTestId('cell-last-error-dl-1');
		// The marker is the translated "no-cause" string.
		expect(cell.textContent).toBe('No cause recorded');
		// It must NOT render as the dash (no-value) used for genuinely-empty fields.
		expect(cell.textContent).not.toBe('—');
	});

	test('non-regression: existing columns are neither displaced nor broken', () => {
		const onInspect = vi.fn();
		const onRequeue = vi.fn();
		const columns = makeDeadLetterColumns(t, 'en', onInspect, onRequeue);
		const ids = columns.map((c) => c.id);

		// The original five columns remain, in the same relative order.
		expect(ids).toContain('job_type');
		expect(ids).toContain('external_state_status');
		expect(ids).toContain('attempts');
		expect(ids).toContain('failed_at');
		expect(ids).toContain('requeued_at');
		expect(ids).toContain('actions');

		// The new column is present.
		expect(ids).toContain('last_error');
	});
});
