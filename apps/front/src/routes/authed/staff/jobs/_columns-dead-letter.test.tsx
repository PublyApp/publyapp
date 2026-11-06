/**
 * @vitest-environment jsdom
 *
 * Brief #1626: the dead-letter "Remettre en file" (Requeue) action must never be
 * clickable while the live staff auth-scope permission request is still in flight
 * (or once it resolves denied). A click that vanishes into nothing is the exact
 * silence the brief forbids.
 *
 * Race-free: the in-flight state is an explicit flag passed to the row-action
 * component; there is no timer race to win.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';

import { DeadLetterRowActions } from './_jobs-row-actions';

const t = (key: string): string => key;

const row: StaffDeadLetterRow = {
	id: 'dl-1',
	originalJobId: null,
	jobType: 'email.send',
	attempts: 3,
	lastError: 'boom',
	externalStateStatus: null,
	triagedAt: null,
	failedAt: null,
	requeuedAsJobId: null,
	requeuedAt: null,
	tenantId: null,
};

const renderRequeueItem = (options?: {
	permissionsPending?: boolean;
	permissionsDenied?: boolean;
	title?: string;
}) => {
	const onInspect = vi.fn();
	const onRequeue = vi.fn();
	render(
		<DeadLetterRowActions
			row={row}
			t={t}
			onInspect={onInspect}
			onRequeue={onRequeue}
			permissionsPending={options?.permissionsPending ?? false}
			permissionsDenied={options?.permissionsDenied ?? false}
			explanation={options?.title}
		/>,
	);
	// Open the row menu so the (portaled) items render.
	fireEvent.click(screen.getByRole('button', { name: 'email.send' }));
	const item = screen.getByTestId('dead-letter-requeue-dl-1');
	return { onRequeue, item };
};

afterEach(() => {
	cleanup();
});

describe('dead-letter Requeue gating (brief #1626)', () => {
	test('Requeue is disabled-with-explanation while the permission request is in flight', () => {
		const { item } = renderRequeueItem({
			permissionsPending: true,
			title: 'Checking your permissions…',
		});

		expect(item.getAttribute('data-disabled')).not.toBeNull();
		expect(item.getAttribute('title')).toBe('Checking your permissions…');
	});

	test('a click while the permission request is in flight is swallowed (never reaches the handler)', () => {
		const { item, onRequeue } = renderRequeueItem({
			permissionsPending: true,
			title: 'Checking your permissions…',
		});

		fireEvent.click(item);

		expect(onRequeue).not.toHaveBeenCalled();
	});

	test('Requeue is disabled-with-explanation once the request resolves denied', () => {
		const { item } = renderRequeueItem({
			permissionsDenied: true,
			title: "You don't have permission for this action.",
		});

		expect(item.getAttribute('data-disabled')).not.toBeNull();
		expect(item.getAttribute('title')).toBe(
			"You don't have permission for this action.",
		);
	});

	test('a click after a denied grant is swallowed (never reaches the handler)', () => {
		const { item, onRequeue } = renderRequeueItem({
			permissionsDenied: true,
			title: "You don't have permission for this action.",
		});

		fireEvent.click(item);

		expect(onRequeue).not.toHaveBeenCalled();
	});

	test('Requeue is enabled and clickable once the permission request resolves granted', () => {
		const { item, onRequeue } = renderRequeueItem();

		expect(item.getAttribute('data-disabled')).toBeNull();
		expect(item.getAttribute('title')).toBeNull();

		fireEvent.click(item);

		expect(onRequeue).toHaveBeenCalledTimes(1);
		expect(onRequeue).toHaveBeenCalledWith(row);
	});
});
