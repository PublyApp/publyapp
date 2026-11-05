/**
 * @vitest-environment jsdom
 *
 * Brief #1626: the system-job actions (enabled Switch, Edit cron, Trigger now)
 * must never be clickable while the live staff auth-scope permission request
 * is in flight (or once it resolves denied). The controls stay rendered (never
 * hidden) but are disabled-with-explanation.
 *
 * Race-free by construction: the in-flight/denied state is an explicit flag on
 * the column builder / row-action component.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StaffSystemJobDefinitionRow } from '~/lib/query/staff-jobs';

import { systemJobColumns } from './_jobs-list-config';
import { SystemJobRowActions } from './_jobs-row-actions';

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
	const permissionsPending = permissions.permissionsPending ?? false;
	const updateDenied = permissions.updateDenied ?? false;
	const triggerDenied = permissions.triggerDenied ?? false;
	const explanation = permissionsPending
		? 'action-permission-checking'
		: 'action-permission-denied';

	const columns = systemJobColumns(t, 'en', {
		permissionsPending,
		updateDenied,
		isTogglePending: false,
		explanation,
		onToggleEnabled,
	});
	const stateCell = columns.find((c) => c.id === 'state');
	expect(stateCell).toBeDefined();

	const { container } = render(
		<div>
			{stateCell?.cell(row)}
			<SystemJobRowActions
				row={row}
				t={t}
				permissionsPending={permissionsPending}
				updateDenied={updateDenied}
				triggerDenied={triggerDenied}
				explanation={explanation}
				onEditCron={onEditCron}
				onTriggerNow={onTriggerNow}
			/>
		</div>,
	);

	const toggle = container.querySelector('[role="switch"]') as HTMLElement;
	const menuTrigger = container.querySelector(
		'[data-slot="dropdown-menu-trigger"]',
	) as HTMLElement;
	fireEvent.click(menuTrigger);
	const editCron = screen.getByTestId(
		'system-job-edit-cron-sj-1',
	) as HTMLButtonElement;
	const trigger = screen.getByTestId(
		'system-job-trigger-sj-1',
	) as HTMLButtonElement;

	return {
		onToggleEnabled,
		onTriggerNow,
		onEditCron,
		toggle,
		editCron,
		trigger,
		menuTrigger,
	};
};

afterEach(() => {
	cleanup();
});

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
			menuTrigger,
		} = renderActions({});

		for (const control of [toggle, editCron, trigger]) {
			expect(control.getAttribute('data-disabled')).toBeNull();
			expect(control.getAttribute('title')).toBeNull();
		}

		fireEvent.click(toggle);
		fireEvent.click(editCron);
		// Choosing an item closes the menu: reopen it for the next action.
		fireEvent.click(menuTrigger);
		fireEvent.click(
			screen.getByTestId('system-job-trigger-sj-1') as HTMLButtonElement,
		);

		expect(onToggleEnabled).toHaveBeenCalledTimes(1);
		expect(onEditCron).toHaveBeenCalledTimes(1);
		expect(onTriggerNow).toHaveBeenCalledTimes(1);
	});
});
