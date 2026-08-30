/**
 * @vitest-environment jsdom
 *
 * A focused test for the split-out `AssignMembersTable` presentational piece
 * (extracted from `AssignMembersDrawer` for react-doctor no-giant-component).
 * The full drawer behaviour stays covered by `_assign-members-drawer.test.tsx`
 * and `_assign-members-drawer.resolve-seam.test.tsx`; this file only proves
 * the split piece mounts and wires its per-row toggle through to `onToggle`.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ColumnDef } from '~/components/table/column-type';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

// v9 moved RowData to table-core; this alias keeps the constraint local.
type RowData = Record<string, unknown>;

vi.mock('~/components/table/data-table', () => ({
	// Minimal stub: renders each row and invokes each column's `cell` so the
	// toggle column (built by makeAssignMembersColumns) is exercised, without
	// pulling in the real table controller machinery.
	DataTable: <T extends RowData>({
		rows,
		columns,
		testId,
	}: {
		rows: T[];
		columns: ColumnDef<T>[];
		testId?: string;
	}) => (
		<table data-testid={testId}>
			<tbody>
				{rows.map((row, rowIndex) => (
					<tr key={rowIndex}>
						{columns.map((column, colIndex) => {
							const cell = (
								column as {
									cell?: (info: { row: { original: T } }) => ReactNode;
								}
							).cell;
							return (
								<td key={colIndex}>
									{cell ? cell({ row: { original: row } }) : null}
								</td>
							);
						})}
					</tr>
				))}
			</tbody>
		</table>
	),
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => <a href={`${to}-${JSON.stringify(params ?? {})}`}>{children}</a>,
}));

vi.mock('~/components/ui/person-avatar', () => ({
	PersonAvatar: ({ name }: { name: string }) => (
		<span data-testid="person-avatar">{name}</span>
	),
}));

vi.mock('~/components/ui/switch', () => ({
	Switch: ({
		checked,
		disabled,
		onCheckedChange,
		'aria-label': ariaLabel,
		'data-testid': testId,
	}: {
		checked?: boolean;
		disabled?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		'aria-label'?: string;
		'data-testid'?: string;
	}) => (
		<button
			type="button"
			data-testid={testId}
			aria-checked={checked ? 'true' : 'false'}
			aria-label={ariaLabel}
			disabled={disabled}
			onClick={() => onCheckedChange?.(!checked)}
		/>
	),
}));

import type { useTableController } from '~/components/table/use-table-controller';
import type { useStaffTenantProfileMemberAssignmentResolutionQuery } from '~/lib/query/staff-tenant-profiles';
import type { StaffTenantUserRow } from '~/lib/query/staff-tenant-users';
import type { useStaffTenantUsersQuery } from '~/lib/query/staff-tenant-users';

import { TenantUserStatusObject } from '@org/client-ts/models/index';

import { AssignMembersTable } from './_assign-members-table';

const ROW: StaffTenantUserRow = {
	id: 'user-1',
	userAccountId: 'account-1',
	email: 'ada@example.com',
	firstName: 'Ada',
	lastName: 'Lovelace',
	avatarUrl: null,
	status: TenantUserStatusObject.Active,
	level: null,
	displayName: 'Ada Lovelace',
};

const t = (key: string, options?: Record<string, unknown>): string => {
	const labels: TestLabelMap = {
		members: 'Members',
		'assign-members': 'Assign members',
		'assign-member-toggle-label': `Toggle profile assignment for ${String(
			(options?.name as string | undefined) ?? '',
		)}`,
	};
	return labels[key] ?? key;
};

// Partial query/controller fakes are intentional: the table only reads the
// members below. The helper is the ONE widening point (a single assert
// through a named shape), matching the repo's other real-route suites
// (see $userId-edit.blocker.test.tsx).
const widenFake = <T,>(value: unknown): T => {
	return value as T;
};

const buildController = () =>
	widenFake<ReturnType<typeof useTableController>>({
		apiVariables: {},
		search: { committed: null, draft: '', onDraftChange: () => {} },
		sort: { id: 'created_at', order: 'desc' },
		onSortChange: () => {},
		size: 20,
		onSizeChange: () => {},
		cursor: {
			pageIndex: 0,
			hasPreviousPage: false,
			onNextPage: () => {},
			onPreviousPage: () => {},
		},
	});

const buildUsersQuery = () =>
	widenFake<ReturnType<typeof useStaffTenantUsersQuery>>({
		isPending: false,
		isError: false,
		isFetching: false,
		refetch: () => Promise.resolve(),
		data: { data: [ROW], nextCursor: null },
	});

const buildResolutionQuery = () =>
	widenFake<
		ReturnType<typeof useStaffTenantProfileMemberAssignmentResolutionQuery>
	>({
		isError: false,
		refetch: () => Promise.resolve(),
	});

const renderTable = (
	overrides: Partial<Parameters<typeof AssignMembersTable>[0]> = {},
) =>
	render(
		<AssignMembersTable
			tenantId="tenant-1"
			t={t}
			assignedIds={new Set<string>()}
			resolvedIds={new Set<string>(['account-1'])}
			pendingIds={new Set<string>()}
			onToggle={vi.fn()}
			rows={[ROW]}
			usersQuery={buildUsersQuery()}
			controller={buildController()}
			resolutionQuery={buildResolutionQuery()}
			{...overrides}
		/>,
	);

afterEach(() => {
	cleanup();
});

describe('AssignMembersTable', () => {
	test('mounts and renders each candidate member row with its toggle', () => {
		renderTable();

		expect(screen.getByTestId('assign-members-table')).toBeTruthy();
		// The member name renders in both the avatar and the record-link span.
		expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
		const toggle = screen.getByTestId('assign-member-toggle-account-1');
		expect(toggle.getAttribute('aria-checked')).toBe('false');
		// Resolved and not pending → enabled.
		expect((toggle as HTMLButtonElement).disabled).toBe(false);
	});

	test('renders a resolved-as-assigned row as checked', () => {
		renderTable({ assignedIds: new Set<string>(['account-1']) });

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('true');
	});

	test('clicking a toggle fires onToggle with the row and the next checked value', () => {
		const onToggle = vi.fn();
		renderTable({ onToggle });

		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));

		expect(onToggle).toHaveBeenCalledTimes(1);
		expect(onToggle).toHaveBeenCalledWith(ROW, true);
	});

	test('disables a row whose assignment status has not resolved yet', () => {
		renderTable({ resolvedIds: new Set<string>() });

		expect(
			(
				screen.getByTestId(
					'assign-member-toggle-account-1',
				) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});
});
