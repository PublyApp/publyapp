/**
 * @vitest-environment jsdom
 *
 * Brief #1720 round 2 — additional validation: verify that the
 * DetailRow component (used in drawers) correctly displays the formatted
 * cause for each case. This proves the drawer shows the right thing
 * without depending on the dropdown portal (which doesn't work well in jsdom).
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { DetailRow } from '~/components/ui/product-page';

import { formatFailureCause } from './_jobs-helpers';

const t = (key: string): string =>
	key === 'common:no-cause' ? 'No cause recorded' : key;

const renderDetailRow = (cause: string | null | undefined) => {
	const formattedValue = formatFailureCause(cause, t);
	render(<DetailRow label="Last error" value={formattedValue} />);
};

afterEach(() => {
	cleanup();
});

describe('DetailRow displays the failure cause correctly (drawer content)', () => {
	test('a short cause is displayed in full', () => {
		renderDetailRow('Connection refused');

		const value = screen.getByText('Connection refused');
		expect(value.textContent).toBe('Connection refused');
		// The cause is not truncated in the drawer (unlike the column)
		expect(value.className).not.toContain('truncate');
	});

	test('a very long cause is displayed in full (not truncated)', () => {
		const longCause =
			'System.Net.Http.HttpRequestException: The socket connection was reset. ---> System.Net.Sockets.SocketException (104): Connection reset by peer at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.ThrowException(SocketError error, CancellationToken cancellationToken, EndPoint endPoint) at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.GetStatusResult(Int16 token, Int32& bytesTransferred, EndPoint& endPoint, SocketFlags& flags) at PublyApp.Infrastructure.Email.SmtpEmailSender.SendAsync(EmailMessage message, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Email.SendEmailJob.HandleAsync(JobContext context, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessAsync(JobQueueItem item, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessWithPolicyAsync(JobQueueItem item, CancellationToken cancellationToken)';

		renderDetailRow(longCause);

		const value = screen.getByText(longCause);
		expect(value.textContent).toBe(longCause);
		// The drawer shows the full cause — NOT truncated (no truncate class)
		expect(value.className).not.toContain('truncate');
	});

	test('a null cause shows the marker', () => {
		renderDetailRow(null);

		const value = screen.getByText('No cause recorded');
		expect(value.textContent).toBe('No cause recorded');
	});

	test('an empty-string cause shows the marker (not blank)', () => {
		renderDetailRow('');

		const value = screen.getByText('No cause recorded');
		expect(value.textContent).toBe('No cause recorded');
		// The marker is NOT the dash
		expect(screen.queryByText('—')).toBeNull();
	});

	test('a whitespace-only cause shows the marker', () => {
		renderDetailRow('   ');

		const value = screen.getByText('No cause recorded');
		expect(value.textContent).toBe('No cause recorded');
	});

	test('a cause with leading/trailing whitespace is trimmed in the drawer', () => {
		renderDetailRow('  boom  ');

		const value = screen.getByText('boom');
		expect(value.textContent).toBe('boom');
	});
});
