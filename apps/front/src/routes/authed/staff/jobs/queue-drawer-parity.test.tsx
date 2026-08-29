/**
 * @vitest-environment jsdom
 *
 * Brief #1720 ronde 2 — validation supplémentaire : le tiroir queue utilise
 * le même helper `formatFailureCause`. On vérifie que le DetailRow affiche
 * la même chose pour les mêmes entrées, prouvant la parité sans dépendre
 * du portail du menu déroulant.
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
	});

	test('a whitespace-only cause shows the marker', () => {
		renderDetailRow('   ');

		const value = screen.getByText('No cause recorded');
		expect(value.textContent).toBe('No cause recorded');
	});

	test('a null cause shows the marker', () => {
		renderDetailRow(null);

		const value = screen.getByText('No cause recorded');
		expect(value.textContent).toBe('No cause recorded');
	});

	test('a very long cause is displayed in full (the drawer does not truncate)', () => {
		const longCause =
			'System.Net.Http.HttpRequestException: The socket connection was reset. ---> System.Net.Sockets.SocketException (104): Connection reset by peer at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.ThrowException(SocketError error, CancellationToken cancellationToken, EndPoint endPoint) at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.GetStatusResult(Int16 token, Int32& bytesTransferred, EndPoint& endPoint, SocketFlags& flags) at PublyApp.Infrastructure.Email.SmtpEmailSender.SendAsync(EmailMessage message, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Email.SendEmailJob.HandleAsync(JobContext context, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessAsync(JobQueueItem item, CancellationToken cancellationToken) at PublyApp.Modules.Jobs.Worker.JobProcessor.ProcessWithPolicyAsync(JobQueueItem item, CancellationToken cancellationToken)';

		renderDetailRow(longCause);

		const value = screen.getByText(longCause);
		expect(value.textContent).toBe(longCause);
	});
});
