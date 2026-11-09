/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const translations = {
				'common:user': 'User',
				'common:history-unknown-account': 'Unknown account',
				'common:history-deleted-user': 'Deleted user',
				'common:no-value': '—',
				'actor-avatar-label': 'Actor',
			} as const;
			return translations[key as keyof typeof translations] ?? key;
		},
	}),
}));

import type { AuditLogDetail } from '@org/client-ts/models/index';

import { AuditLogActor } from './_audit-log-detail-parts';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const baseDetail: AuditLogDetail = {
	id: 'log-1',
	userId: 'user-1',
	userName: 'Ada Admin',
	userEmail: 'ada@example.com',
	action: 'auth.login.failed',
	createdAt: new Date('2026-07-02T08:30:00Z'),
	ipAddress: '127.0.0.1',
	userAgent: 'node',
	targetId: null,
	details: null,
};

describe('AuditLogActor', () => {
	test('a known actor shows their name and email with an identity avatar', () => {
		render(<AuditLogActor auditLog={baseDetail} />);

		expect(screen.getByText('Ada Admin')).toBeTruthy();
		expect(screen.getByText('ada@example.com')).toBeTruthy();
		const avatar = document.querySelector('[data-slot="person-avatar"]');
		expect(avatar?.getAttribute('data-system')).toBeNull();
	});

	test('an unknown-account event shows the translated label and attempted email from details', () => {
		const detail: AuditLogDetail = {
			...baseDetail,
			userId: null,
			userName: '(unknown)',
			userEmail: '(unknown)',
			details: JSON.stringify({
				Email: 'nobody@example.com',
				Reason: 'no_such_user',
			}),
		};

		render(<AuditLogActor auditLog={detail} />);

		expect(screen.getByText('Unknown account')).toBeTruthy();
		expect(screen.getByText('nobody@example.com')).toBeTruthy();
		const avatar = document.querySelector('[data-slot="person-avatar"]');
		expect(avatar?.hasAttribute('data-system')).toBe(true);
	});

	test('an unknown-account event with no details email shows a dash for email', () => {
		const detail: AuditLogDetail = {
			...baseDetail,
			userId: null,
			userName: '(unknown)',
			userEmail: '(unknown)',
			details: null,
		};

		const { container } = render(<AuditLogActor auditLog={detail} />);

		expect(screen.getByText('Unknown account')).toBeTruthy();
		// The email paragraph carries the shared no-value dash
		const emailParagraph = container.querySelector('p.text-muted-foreground');
		expect(emailParagraph?.textContent).toBe('—');
	});

	test('a deleted-user event shows the translated label and hides the synthetic email', () => {
		const detail: AuditLogDetail = {
			...baseDetail,
			userId: 'user-deleted',
			userName: '(deleted user)',
			userEmail: '(unknown)',
		};

		const { container } = render(<AuditLogActor auditLog={detail} />);

		expect(screen.getByText('Deleted user')).toBeTruthy();
		// The email paragraph carries the shared no-value dash
		const emailParagraph = container.querySelector('p.text-muted-foreground');
		expect(emailParagraph?.textContent).toBe('—');
		const avatar = document.querySelector('[data-slot="person-avatar"]');
		expect(avatar?.hasAttribute('data-system')).toBe(true);
	});
});
