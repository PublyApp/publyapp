/**
 * @vitest-environment jsdom
 *
 * Brief #1626: the system-job actions (enabled Switch, Edit cron, Trigger now)
 * must never be clickable while the live staff auth-scope permission request is
 * in flight (or once it resolves denied). A click that vanishes into nothing is
 * the exact silence the brief forbids. The controls stay rendered (never hidden)
 * but are disabled-with-explanation.
 *
 * Race-free by construction: the in-flight/denied state is held by an explicit
 * flag on the column builder. See .dump/preuve-1626.md for the red/green proof.
 */
import { fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, test, vi } from 'vitest';
import type { StaffSystemJobDefinitionRow } from '~/lib/query/staff-jobs';

import { makeSystemJobColumns } from './_columns-system-jobs';

const t = (key: string): string => key;

const row: StaffSystemJobDefinitionRow = {
	id: 'sj-1',
	jobKey: 'email.send',
	cronExpression: '0 * * * *',
	isEnabled: true,
	lastEnqueuedAt: null,
	updatedAt: null,
};

const renderActions = (permissions: {
	permissionsPending?: boolean;
	updateDenied?: boolean;
	triggerDenied?: boolean;
}) => {
	const onToggleEnabled = vi.fn();
	const onTriggerNow = vi.fn();
	const onEditCron = vi.fn();
	const columns = makeSystemJobColumns(t, 'en', {
		canUpdateSystemJob: true,
		canTriggerSystemJob: true,
		permissionsPending: permissions.permissionsPending ?? false,
		updateDenied: permissions.updateDenied ?? false,
		triggerDenied: permissions.triggerDenied ?? false,
		isTogglePending: false,
		onToggleEnabled,
		onTriggerNow,
		onEditCron,
	});
	const toggleCell = columns.find((c) => c.id === 'is_enabled');
	const actionsCell = columns.find((c) => c.id === 'actions');
	const toggleUi = (
		toggleCell!.cell as (ctx: {
			row: { original: StaffSystemJobDefinitionRow };
		}) => ReactElement
	)({ row: { original: row } });
	const actionsUi = (
		actionsCell!.cell as (ctx: {
			row: { original: StaffSystemJobDefinitionRow };
		}) => ReactElement
	)({ row: { original: row } });
	const { container } = render(
		<div>
			{toggleUi}
			{actionsUi}
		</div>,
	);

	const toggle = container.querySelector('[role="switch"]') as HTMLElement;
	const editCron = container.querySelector(
		'[data-testid="system-job-edit-cron-sj-1"]',
	) as HTMLButtonElement;
	const trigger = container.querySelector(
		'[data-testid="system-job-trigger-sj-1"]',
	) as HTMLButtonElement;

	return {
		onToggleEnabled,
		onTriggerNow,
		onEditCron,
		toggle,
		editCron,
		trigger,
	};
};

describe('system-job actions gating (brief #1626)', () => {
	test('while the permission request is in flight, all actions are disabled-with-explanation', () => {
		const { toggle, editCron, trigger } = renderActions({
			permissionsPending: true,
		});

		for (const control of [toggle, editCron, trigger]) {
			expect(control.getAttribute('data-disabled')).not.toBeNull();
			expect(control.getAttribute('title')).toBe('action-permission-checking');
		}
	});

	test('clicks during flight are swallowed (no handler fires)', () => {
		const {
			onToggleEnabled,
			onTriggerNow,
			onEditCron,
			toggle,
			editCron,
			trigger,
		} = renderActions({ permissionsPending: true });

		fireEvent.click(toggle);
		fireEvent.click(editCron);
		fireEvent.click(trigger);

		expect(onToggleEnabled).not.toHaveBeenCalled();
		expect(onEditCron).not.toHaveBeenCalled();
		expect(onTriggerNow).not.toHaveBeenCalled();
	});

	test('once the grant resolves denied for update, edit-cron and toggle are disabled-with-explanation', () => {
		const { toggle, editCron, trigger } = renderActions({
			updateDenied: true,
		});

		for (const control of [toggle, editCron]) {
			expect(control.getAttribute('data-disabled')).not.toBeNull();
			expect(control.getAttribute('title')).toBe('action-permission-denied');
		}
		// trigger is a separate grant and must stay enabled for this user.
		expect(trigger.getAttribute('data-disabled')).toBeNull();
		expect(trigger.getAttribute('title')).toBeNull();
	});

	test('clicks after an update-denied grant are swallowed only for the denied actions', () => {
		const {
			onToggleEnabled,
			onTriggerNow,
			onEditCron,
			toggle,
			editCron,
			trigger,
		} = renderActions({ updateDenied: true });

		fireEvent.click(toggle);
		fireEvent.click(editCron);
		fireEvent.click(trigger);

		expect(onToggleEnabled).not.toHaveBeenCalled();
		expect(onEditCron).not.toHaveBeenCalled();
		expect(onTriggerNow).toHaveBeenCalledTimes(1);
	});

	test('once the grant resolves denied for trigger only, trigger is disabled-with-explanation but edit-cron stays enabled', () => {
		const { editCron, trigger } = renderActions({
			triggerDenied: true,
		});

		expect(trigger.getAttribute('data-disabled')).not.toBeNull();
		expect(trigger.getAttribute('title')).toBe('action-permission-denied');
		expect(editCron.getAttribute('data-disabled')).toBeNull();
		expect(editCron.getAttribute('title')).toBeNull();
	});

	test('once the permission request resolves granted, all actions are enabled and clickable', () => {
		const {
			onToggleEnabled,
			onTriggerNow,
			onEditCron,
			toggle,
			editCron,
			trigger,
		} = renderActions({});

		for (const control of [toggle, editCron, trigger]) {
			expect(control.getAttribute('data-disabled')).toBeNull();
			expect(control.getAttribute('title')).toBeNull();
		}

		fireEvent.click(toggle);
		fireEvent.click(editCron);
		fireEvent.click(trigger);

		expect(onToggleEnabled).toHaveBeenCalledTimes(1);
		expect(onEditCron).toHaveBeenCalledTimes(1);
		expect(onTriggerNow).toHaveBeenCalledTimes(1);
	});
});
