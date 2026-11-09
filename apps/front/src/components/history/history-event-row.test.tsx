/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const translations = {
				'history-system': 'System',
				'history-unknown-account': 'Unknown account',
				'history-deleted-user': 'Deleted user',
				'history-sensitive': 'Sensitive',
				'history-open': 'Open',
				'history-category-auth': 'Authentication',
				'auth.login.failed': 'failed to sign in',
			} as const;
			return translations[key as keyof typeof translations] ?? key;
		},
		i18n: { exists: (key: string) => key in { 'auth.login.failed': true } },
	}),
}));

import { HistoryEventRow } from './history-event-row';
import type { HistoryEvent } from './history-types';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const baseEvent: HistoryEvent = {
	id: 'log-1',
	at: new Date('2026-07-02T08:30:00Z'),
	actorName: 'Ada Admin',
	userId: 'user-1',
	action: 'auth.login.failed',
	ipAddress: '127.0.0.1',
	targetId: null,
};

const renderRow = (event: HistoryEvent) =>
	render(
		<HistoryEventRow
			event={event}
			locale="en"
			showOrganisation={false}
			onOpen={() => {}}
			openLabel={() => 'Open'}
		/>,
	);

describe('HistoryEventRow actor rendering', () => {
	test('a known actor shows their name and an identity avatar', () => {
		renderRow(baseEvent);

		expect(screen.getByText('Ada Admin')).toBeTruthy();
		const avatar = document.querySelector('[data-slot="person-avatar"]');
		expect(avatar?.getAttribute('data-system')).toBeNull();
	});

	test('an unknown-account event (null userId) shows the translated label and neutral avatar', () => {
		renderRow({
			...baseEvent,
			actorName: '(unknown)',
			userId: null,
		});

		expect(screen.getByText('Unknown account')).toBeTruthy();
		const avatar = document.querySelector('[data-slot="person-avatar"]');
		expect(avatar?.hasAttribute('data-system')).toBe(true);
	});

	test('a deleted-user event shows the translated label and neutral avatar', () => {
		renderRow({
			...baseEvent,
			actorName: '(deleted user)',
			userId: 'user-deleted',
		});

		expect(screen.getByText('Deleted user')).toBeTruthy();
		const avatar = document.querySelector('[data-slot="person-avatar"]');
		expect(avatar?.hasAttribute('data-system')).toBe(true);
	});

	test('a system event (null actorName) shows System and neutral avatar', () => {
		renderRow({
			...baseEvent,
			actorName: null,
			userId: null,
		});

		expect(screen.getByText('System')).toBeTruthy();
		const avatar = document.querySelector('[data-slot="person-avatar"]');
		expect(avatar?.hasAttribute('data-system')).toBe(true);
	});
});
