import { describe, expect, test } from 'vitest';

import { categorizeAuditAction } from './_audit-log-action-category';

describe('categorizeAuditAction', () => {
	test('falls back to a neutral Event for an empty action', () => {
		expect(categorizeAuditAction(null)).toEqual({
			kind: 'Event',
			tone: 'neutral',
		});
		expect(categorizeAuditAction('')).toEqual({
			kind: 'Event',
			tone: 'neutral',
		});
	});

	test('kinds the category from the dotted action prefix', () => {
		expect(categorizeAuditAction('user.updated').kind).toBe('User');
		expect(categorizeAuditAction('tenant.created').kind).toBe('Tenant');
		expect(categorizeAuditAction('system.started').kind).toBe('System');
	});

	test('auth.succeeded/auth.failed map to success/danger', () => {
		expect(categorizeAuditAction('auth.succeeded')).toEqual({
			kind: 'Auth',
			tone: 'success',
		});
		expect(categorizeAuditAction('auth.failed')).toEqual({
			kind: 'Auth',
			tone: 'danger',
		});
	});

	test('destructive verbs map to danger regardless of domain', () => {
		expect(categorizeAuditAction('user.deleted')).toEqual({
			kind: 'User',
			tone: 'danger',
		});
		expect(categorizeAuditAction('invitation.revoked')).toEqual({
			kind: 'Invitation',
			tone: 'danger',
		});
		expect(categorizeAuditAction('auth.session.removed')).toEqual({
			kind: 'Auth',
			tone: 'danger',
		});
	});

	test('impersonation and system categories carry their own tones', () => {
		expect(categorizeAuditAction('impersonation.started')).toEqual({
			kind: 'Impersonation',
			tone: 'warning',
		});
		expect(categorizeAuditAction('system.booted')).toEqual({
			kind: 'System',
			tone: 'info',
		});
	});

	test('suspended/reactivated carry warning/success tones', () => {
		expect(categorizeAuditAction('user.suspended')).toEqual({
			kind: 'User',
			tone: 'warning',
		});
		expect(categorizeAuditAction('user.reactivated')).toEqual({
			kind: 'User',
			tone: 'success',
		});
	});

	test('unknown non-destructive actions stay neutral', () => {
		expect(categorizeAuditAction('post.published')).toEqual({
			kind: 'Post',
			tone: 'neutral',
		});
	});
});
