/**
 * @vitest-environment jsdom
 *
 * Brief #1720 round 2 — additional validation: the queue drawer uses
 * the same `formatFailureCause` helper. Verifies that DetailRow displays
 * the same thing for the same entries, proving parity without depending
 * on the dropdown portal.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { DetailRow } from '~/components/ui/product-page';

import { formatFailureCause } from './_jobs-helpers';

// Track calls so mutations that hardcode a string (bypassing t()) are caught.
const tCalls: string[] = [];
const t = (key: string): string => {
	tCalls.push(key);
	if (key === 'common:no-cause') {
		return 'No cause recorded';
	}

	return key;
};

const renderDetailRow = (cause: string | null | undefined) => {
	const formattedValue = formatFailureCause(cause, t);
	render(<DetailRow label="Last error" value={formattedValue} />);
};

afterEach(() => {
	cleanup();
	tCalls.length = 0;
});

describe('queue drawer DetailRow — parity with dead-letter drawer', () => {
	test('a short cause is displayed in full', () => {
		renderDetailRow('Connection refused');

		const value = screen.getByText('Connection refused');
		expect(value.textContent).toBe('Connection refused');
	});

	test('an empty-string cause shows the marker, not a blank cell', () => {
		renderDetailRow('');

		const value = screen.getByText('No cause recorded');
		expect(value.textContent).toBe('No cause recorded');
		// NOT the dash
		expect(screen.queryByText('—')).toBeNull();
		// t() must have been called with the key, not bypassed by a hardcoded literal
		expect(tCalls).toContain('common:no-cause');
	});

	test('a whitespace-only cause shows the marker', () => {
		renderDetailRow('   ');

		const value = screen.getByText('No cause recorded');
		expect(value.textContent).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('a null cause shows the marker', () => {
		renderDetailRow(null);

		const value = screen.getByText('No cause recorded');
		expect(value.textContent).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('a very long cause is displayed in full (the drawer does not truncate)', () => {
		const longCause =
			'System.Net.Http.HttpRequestException: The socket connection was reset. ---> System.Net.Sockets.SocketException (104): Connection reset by peer at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.ThrowException(SocketError error, CancellationToken cancellationToken, EndPoint endPoint) at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.GetStatusResult(Int16 token, Int32& bytesTransferred, EndPoint& endPoint, SocketFlags& flags) at PublyApp.Infrastructure.Email.SmtpEmailSender.SendAsync(EmailMessage message, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Email.SendEmailJob.HandleAsync(JobContext context, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessAsync(JobQueueItem item, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessWithPolicyAsync(JobQueueItem item, CancellationToken cancellationToken)';

		renderDetailRow(longCause);

		const value = screen.getByText(longCause);
		expect(value.textContent).toBe(longCause);
	});
});
