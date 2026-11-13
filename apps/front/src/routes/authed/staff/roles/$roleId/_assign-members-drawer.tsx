import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { SearchInput } from '~/components/ui/search-input';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-feedback/mutation-toast';
import { useBulkAssignStaffRoleUsersMutation } from '~/lib/query/staff-role-users';
import { toStaffUserRows, useStaffUsersQuery } from '~/lib/query/staff-users';

import type { BulkStaffRoleUserAssignActionResult } from '@org/client-ts/models/index';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

const PAGE_SIZE = 50;

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Per-member outcome lines for the skipped ids, reasons translated here
 * (an unknown future reason falls back to its raw value). */
export const buildAssignFailureLines = (
	result: BulkStaffRoleUserAssignActionResult | undefined,
	nameOf: (userId: string) => string,
	t: Translate,
): string[] => {
	const reasonLabels = new Map<string, string>([
		['already_assigned', t('bulk-assign-failed-item-already-assigned')],
		['not_found', t('bulk-assign-failed-item-not-found')],
		['max_roles_exceeded', t('bulk-assign-failed-item-max-roles-exceeded')],
	]);

	return (result?.failedItems ?? []).map((item) => {
		const userId = String(item.userId ?? '');
		const reason = reasonLabels.get(item.reason ?? '') ?? item.reason ?? '';
		return [nameOf(userId), reason].filter(Boolean).join(': ');
	});
};

const AssignMembersBody = ({
	roleId,
	onClose,
	onSessionExpired,
}: {
	roleId: string;
	onClose: () => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const [q, setQ] = useState('');
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const assignMutation = useBulkAssignStaffRoleUsersMutation();
	// preload-exempt: opened on demand from the page's action, nothing to warm
	const usersQuery = useStaffUsersQuery({
		q: q.trim(),
		size: PAGE_SIZE,
		excludeRoleId: roleId,
	});
	const rows = toStaffUserRows(usersQuery.data?.data);

	const toggle = (id: string, checked: boolean): void => {
		setSelected((current) => {
			const next = new Set(current);
			if (checked) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	};

	const submit = async () => {
		const userIds = [...selected];
		let result;
		try {
			result = await assignMutation.mutateAsync({ roleId, userIds });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}
			await displayLocalMutationFailure(
				error,
				t('staff-role-user-bulk-assign-failure'),
			);
			return;
		}

		const succeeded = result?.succeededCount ?? 0;
		const failed = result?.failedCount ?? 0;
		if (failed > 0) {
			const lines = buildAssignFailureLines(
				result,
				(userId) =>
					rows.find((row) => row.id === userId)?.displayName ?? userId,
				t,
			);
			toastLocalMutationResult.error(
				t('staff-role-user-bulk-assign-partial-success', { succeeded, failed }),
				lines.join('\n'),
			);
		} else {
			toastLocalMutationResult.success(
				t('staff-role-user-bulk-assign-success', { count: succeeded }),
			);
		}
		onClose();
	};

	return (
		<>
			<DrawerBody className="flex min-h-0 flex-1 flex-col gap-3">
				<SearchInput
					value={q}
					onValueChange={setQ}
					placeholder={t('search-assignable-staff-members')}
					aria-label={t('search-assignable-staff-members')}
					clearLabel={t('clear-search')}
				/>
				<QueryDisplay
					query={usersQuery}
					isEmpty={() => rows.length === 0}
					EmptySlot={
						<p className="text-sm text-muted-foreground">
							{t('no-assignable-staff-members')}
						</p>
					}
				>
					{() => (
						<ul
							className="flex min-h-0 flex-col divide-y overflow-y-auto"
							data-testid="assign-members-list"
						>
							{rows.map((row) => (
								<li key={row.id}>
									<label className="flex cursor-pointer items-center gap-3 py-2">
										<Checkbox
											checked={selected.has(row.id)}
											onCheckedChange={(checked) =>
												toggle(row.id, checked === true)
											}
											aria-label={row.displayName}
										/>
										<span className="min-w-0">
											<span className="block truncate text-sm font-medium">
												{row.displayName}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{row.email}
											</span>
										</span>
									</label>
								</li>
							))}
						</ul>
					)}
				</QueryDisplay>
			</DrawerBody>
			<DrawerFooter>
				<Button type="button" variant="outline" onClick={onClose}>
					{t('cancel')}
				</Button>
				<Button
					type="button"
					disabled={selected.size === 0 || assignMutation.isPending}
					onClick={() => void submit()}
				>
					{t('assign-selected-members', { count: selected.size })}
				</Button>
			</DrawerFooter>
		</>
	);
};

export const AssignMembersDrawer = ({
	roleId,
	isOpen,
	onOpenChange,
	onSessionExpired,
}: {
	roleId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');

	return (
		<Drawer open={isOpen} onOpenChange={onOpenChange}>
			<DrawerContent data-testid="staff-assign-members-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('assign-staff-members')}</DrawerTitle>
					<DrawerDescription>
						{t('assign-staff-members-drawer-description')}
					</DrawerDescription>
				</DrawerHeader>
				{isOpen ? (
					<AssignMembersBody
						roleId={roleId}
						onClose={() => onOpenChange(false)}
						onSessionExpired={onSessionExpired}
					/>
				) : null}
			</DrawerContent>
		</Drawer>
	);
};
