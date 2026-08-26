/**
 * @vitest-environment jsdom
 *
 * Brief #1626: the dead-letter "Remettre en file" (Requeue) action must never be
 * clickable while the live staff auth-scope permission request is still in flight
 * (or once it resolves denied). A click that vanishes into nothing is the exact
 * silence the brief forbids.
 *
 * These tests are intentionally race-free: the in-flight state is held by an
 * explicit `permissionsPending`/`permissionsDenied` flag passed to the column
 * builder — there is no timer race to win. The proof file (.dump/preuve-1626.md)
 * shows the suite goes red when the faulty form (item clickable during flight) is
 * reinserted.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StaffDeadLetterRow } from '~/lib/query/staff-jobs';

import { makeDeadLetterColumns } from './_columns-dead-letter';

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
	const columns = makeDeadLetterColumns(t, 'en', onInspect, onRequeue, options);
	const actions = columns.find((c) => c.id === 'actions');
	const ui = (
		actions!.cell as (ctx: {
			row: { original: StaffDeadLetterRow };
		}) => ReactElement
	)({
		row: { original: row },
	});
	render(ui);
	// Open the row menu so the (portaled) items render.
	fireEvent.click(screen.getByRole('button'));
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
