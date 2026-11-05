import { describe, expect, test } from 'vitest';

import {
	historyActionPhraseKey,
	historyCategory,
	isSensitiveHistoryAction,
} from './history-actions';

describe('history category', () => {
	test('maps the backend action domains to the nine categories', () => {
		expect(historyCategory('auth.login.failed')).toBe('auth');
		expect(historyCategory('tenant.suspended')).toBe('tenant');
		expect(historyCategory('tenant.profile.updated')).toBe('tenant');
		expect(historyCategory('tenant.user.suspended')).toBe('member');
		expect(historyCategory('tenant.profile.user.assigned')).toBe('member');
		expect(historyCategory('staff.user.deleted')).toBe('staff');
		expect(historyCategory('impersonation.started')).toBe('impersonation');
		expect(historyCategory('tenant.invitation.accepted')).toBe('invitation');
		expect(historyCategory('job.dead_letter.requeued')).toBe('job');
		expect(historyCategory('publication.scheduled')).toBe('content');
		expect(historyCategory('socialaccount.connected')).toBe('content');
		expect(historyCategory('upload.asset.deleted')).toBe('content');
		expect(historyCategory('system.notice.created')).toBe('system');
	});

	test('falls back to the neutral bucket for an unknown action', () => {
		expect(historyCategory('future.action.created')).toBe('other');
		expect(historyCategory(null)).toBe('other');
		expect(historyCategory('  ')).toBe('other');
	});
});

describe('sensitive history action', () => {
	test('covers suspensions, impersonations and refused logins', () => {
		expect(isSensitiveHistoryAction('tenant.suspended')).toBe(true);
		expect(
			isSensitiveHistoryAction('tenant.user.companies.bulk.suspended'),
		).toBe(true);
		expect(isSensitiveHistoryAction('impersonation.started')).toBe(true);
		expect(isSensitiveHistoryAction('impersonation.ended')).toBe(true);
		expect(isSensitiveHistoryAction('auth.login.failed')).toBe(true);
	});

	test('leaves ordinary actions out', () => {
		expect(isSensitiveHistoryAction('auth.login.succeeded')).toBe(false);
		expect(isSensitiveHistoryAction('tenant.created')).toBe(false);
		expect(isSensitiveHistoryAction('staff.user.reactivated')).toBe(false);
		expect(isSensitiveHistoryAction(null)).toBe(false);
	});
});

describe('action phrase key', () => {
	test('flattens the action key into the common namespace key', () => {
		expect(historyActionPhraseKey('tenant.suspended')).toBe(
			'history-action-tenant-suspended',
		);
		expect(historyActionPhraseKey('job.dead_letter.requeued')).toBe(
			'history-action-job-dead_letter-requeued',
		);
		expect(historyActionPhraseKey(null)).toBeNull();
	});
});
