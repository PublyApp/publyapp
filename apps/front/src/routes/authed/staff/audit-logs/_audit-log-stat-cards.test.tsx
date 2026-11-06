/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

// The card reads its labels from the page's own namespace; the test runs
// without an i18n instance, so it binds `t` to the key-only translator.
vi.mock('react-i18next', () => ({
	useTranslation: () => ({ t }),
}));

import { AuditLogStatCards } from './_audit-log-stat-cards';

const t = (key: string, options?: Record<string, unknown>): string =>
	options ? `${key}:${Object.values(options).join(',')}` : key;

afterEach(() => {
	cleanup();
});

describe('AuditLogStatCards', () => {
	test('reads today, 30 days and the sensitive families from the API counts', () => {
		render(
			<AuditLogStatCards
				counts={{
					today: 8,
					last30Days: 35,
					byAction: [
						{ action: 'tenant.suspended', count: 2 },
						{ action: 'impersonation.started', count: 1 },
						{ action: 'auth.login.failed', count: 3 },
						{ action: 'invitation.created', count: 4 },
					],
					byActor: [],
				}}
			/>,
		);

		// « Événements aujourd'hui »: the day figure, the 30-day total beneath.
		const today = screen.getByTestId('audit-stat-today');
		expect(today.textContent).toContain('8');
		expect(today.textContent).toContain('stat-events-today-window:35');
		// Sensitive = suspensions + impersonations + refused sign-ins.
		expect(screen.getByTestId('audit-stat-sensitive').textContent).toContain(
			'6',
		);
		expect(
			screen.getByTestId('audit-stat-impersonations').textContent,
		).toContain('1');
		expect(screen.getByTestId('audit-stat-denied').textContent).toContain('3');
	});

	test('keeps « — » while the API has not answered', () => {
		render(<AuditLogStatCards counts={null} />);

		expect(screen.getAllByText('—')).toHaveLength(5);
	});
});
