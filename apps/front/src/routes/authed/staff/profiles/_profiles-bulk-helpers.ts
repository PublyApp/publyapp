import type { StaffProfileRow } from '~/lib/query/staff-profiles';

/** #1386 — bulk-delete eligibility for the staff profiles selection toolbar.
 * Mirrors the backend contract of
 * `StaffProfileAsStaffService.BulkDeleteStaffProfilesAsync`: assigned members
 * do NOT block a delete (the service purges the UserAccountProfile links, so
 * `userAccountCount` is informational only), and only ids resolvable from the
 * loaded rows are deletable — a stale selected id absent from `rows` would be
 * reported as a per-item failure by the API. The service also skips
 * default profiles server-side; the staff list contract
 * (`StaffProfileItem`) does not expose that flag, so such rows simply come
 * back inside `failedItems` and surface through the partial-success toast. */
export const getDeletableProfileIds = (
	rows: StaffProfileRow[],
	rowSelection: Record<string, boolean | undefined>,
): string[] => {
	const rowIds = new Set(rows.map((row) => row.id));

	return Object.entries(rowSelection).flatMap(([id, isSelected]) =>
		isSelected && rowIds.has(id) ? [id] : [],
	);
};
