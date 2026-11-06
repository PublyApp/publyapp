import type { useRowSelection } from '~/components/table/use-row-selection';

import {
	type KnownInvitationStatus,
	parseInvitationStatusFilter,
	serializeInvitationStatusFilter,
} from '../../invitations/list-helpers';
import { formatTenantInvitationStatusLabel } from './_invitation-columns';
import type { InvitationRouteSearchParams } from './_invitations-route-search';

/** Row-selection state returned by `useRowSelection`. */
type RowSelection = ReturnType<typeof useRowSelection>;

/** Prop bundle for the status dropdown rendered at the far end of the table
 * toolbar (`_invitation-toolbar-filters`). */
type InvitationsToolbarState = {
	selectedStatuses: KnownInvitationStatus[];
	statusFilterLabel: string;
	/** #838: filters lock while row-selection mode is active. */
	selectionLocked: boolean;
	onSetStatuses: (nextStatuses: KnownInvitationStatus[]) => void;
	onToggleStatus: (status: KnownInvitationStatus) => void;
};

export type InvitationsFilterState = {
	selectedStatuses: KnownInvitationStatus[];
	statusFilterLabel: string;
	setStatuses: (nextStatuses: KnownInvitationStatus[]) => void;
	toggleStatus: (status: KnownInvitationStatus) => void;
	/** Active row-selection state, passed through so the table can hand the
	 * selection to `DataTable` while the toolbar reads it for lock state. */
	selection: RowSelection;
	toolbar: InvitationsToolbarState;
};

type BuildInvitationsFilterStateArgs = {
	search: InvitationRouteSearchParams;
	t: (key: string, options?: Record<string, unknown>) => string;
	applySearch: (next: InvitationRouteSearchParams) => void;
	/** Active row-selection state from `useRowSelection`; forwarded to the
	 * toolbar's lock logic and to the table's selection prop. */
	selection: RowSelection;
};

/** Status filter selection, labels and toggles for the tenant
 * invitations table. Split out of the route file for
 * `react-doctor/no-giant-component`; navigation semantics are unchanged —
 * every mutation resets the cursor and replaces the current history entry. */
export const buildInvitationsFilterState = ({
	search,
	t,
	applySearch,
	selection,
}: BuildInvitationsFilterStateArgs): InvitationsFilterState => {
	const selectedStatuses = parseInvitationStatusFilter(search.status);

	const setStatuses = (nextStatuses: KnownInvitationStatus[]): void => {
		applySearch({
			...search,
			status: serializeInvitationStatusFilter(nextStatuses),
			cursor: undefined,
		});
	};

	const toggleStatus = (status: KnownInvitationStatus): void => {
		if (selectedStatuses.includes(status)) {
			setStatuses(selectedStatuses.filter((value) => value !== status));
			return;
		}

		setStatuses([...selectedStatuses, status]);
	};

	const statusFilterLabel =
		selectedStatuses.length === 0
			? t('all-statuses')
			: selectedStatuses
					.map((status) => formatTenantInvitationStatusLabel(status, t))
					.join(', ');

	return {
		selectedStatuses,
		statusFilterLabel,
		setStatuses,
		toggleStatus,
		selection,
		toolbar: {
			selectedStatuses,
			statusFilterLabel,
			selectionLocked: selection.isSelectionMode,
			onSetStatuses: setStatuses,
			onToggleStatus: toggleStatus,
		},
	};
};
