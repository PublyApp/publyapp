import { useMemo, useState } from 'react';
import { useOffsetPageClamp } from '~/components/table/offset-pagination';
import { useTableController } from '~/components/table/use-table-controller';
import {
	toStaffTenantProfileMemberRows,
	useStaffTenantProfileDetailsQuery,
	useStaffTenantProfileMembersQuery,
} from '~/lib/query/staff-tenant-profiles';
import { useStaffTenantDetailsQuery } from '~/lib/query/staff-tenants';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import { makeProfileMemberColumns } from '../_profile-member-columns';
import type { ProfileMembersSearchParams } from './_profile-members-search';

const MEMBERS_DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const MEMBERS_DEFAULT_SIZE = 20;

type UseStaffTenantProfileMembersArgs = {
	tenantId: string;
	profileId: string;
	/** Validated route search (`Route.useSearch()`), owned by the URL. */
	search: ProfileMembersSearchParams;
	/** Opens (`true`) or closes (`false`) the assign drawer via the URL
	 * `assign=1` flag. Owned by the route file so the TanStack `navigate`
	 * generics stay there; only event handlers may call it. */
	setAssignDrawerOpen: (isOpen: boolean) => void;
	/** Commits the next table search params to the URL. Same ownership rule:
	 * called exclusively from toolbar event handlers downstream. */
	onMembersSearchChange: (next: TableSearchParams) => void;
	t: (key: string, options?: Record<string, unknown>) => string;
	language: string;
};

/**
 * Every piece of members-tab state the profile members page renders: the
 * table controller, the chained tenant/profile/members queries, the derived
 * rows and columns, and the offset-page clamp. Split out of the route file
 * for `react-doctor/no-giant-component`; semantics are unchanged.
 */
export const useStaffTenantProfileMembers = ({
	tenantId,
	profileId,
	search,
	setAssignDrawerOpen,
	onMembersSearchChange,
	t,
	language,
}: UseStaffTenantProfileMembersArgs) => {
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const isAssignDrawerOpen = search.assign === 1;

	const [membersPageIndex, setMembersPageIndex] = useState(0);
	const membersController = useTableController({
		search,
		onSearchChange: onMembersSearchChange,
		defaultSort: MEMBERS_DEFAULT_SORT,
		defaultSize: MEMBERS_DEFAULT_SIZE,
	});

	const tenantQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	// Hoisted locals keep raw query flags out of the chained-query gates.
	const tenantQueryIsPending = tenantQuery.isPending;
	const tenantQueryIsError = tenantQuery.isError;
	const detailQuery = useStaffTenantProfileDetailsQuery(
		{ tenantId, profileId },
		{
			enabled:
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQueryIsPending &&
				!tenantQueryIsError,
		},
	);
	const detailQueryIsPending = detailQuery.isPending;
	const detailQueryIsError = detailQuery.isError;
	const membersQuery = useStaffTenantProfileMembersQuery(
		{
			tenantId,
			profileId,
			q: membersController.search.committed,
			sortId: membersController.sort.id,
			sortOrder: membersController.sort.order,
			pageIndex: membersPageIndex,
			size: membersController.size,
		},
		{
			enabled:
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQueryIsPending &&
				!tenantQueryIsError &&
				!detailQueryIsPending &&
				!detailQueryIsError,
		},
	);
	// A deliberate reset (tenant/profile identity, search, sort, or size
	// change) must always win over a clamp derived from the destination
	// query's count - including an already-warm cached count, not just a
	// missing one (#999 review follow-up). `useOffsetPageClamp` is now a
	// pure derivation: it returns the value the pageIndex should hold, and
	// the caller commits it during render via React's documented
	// adjust-state-while-rendering pattern. That replaces the previous
	// `useEffect(setPageIndex(clamped))` pattern, which violated
	// no-pass-data-to-parent / no-pass-live-state-to-parent and
	// re-rendered the parent one frame late (#691).
	const clampedMembersPageIndex = useOffsetPageClamp({
		pageIndex: membersPageIndex,
		size: membersController.size,
		count: membersQuery.data?.count,
		resetKeys: [
			tenantId,
			profileId,
			membersController.search.committed,
			membersController.sort.id,
			membersController.sort.order,
			membersController.size,
		],
	});
	if (clampedMembersPageIndex !== membersPageIndex) {
		setMembersPageIndex(clampedMembersPageIndex);
	}
	const memberRows = useMemo(
		() => toStaffTenantProfileMemberRows(membersQuery.data?.users),
		[membersQuery.data?.users],
	);
	const memberColumns = useMemo(
		() => makeProfileMemberColumns(tenantId, t, language),
		[language, tenantId, t],
	);

	return {
		detailQuery,
		isAssignDrawerOpen,
		memberColumns,
		memberRows,
		membersController,
		membersPageIndex,
		membersQuery,
		setAssignDrawerOpen,
		setMembersPageIndex,
		setShouldRedirectToLogout,
		shouldRedirectToLogout,
		tenantQuery,
	};
};
