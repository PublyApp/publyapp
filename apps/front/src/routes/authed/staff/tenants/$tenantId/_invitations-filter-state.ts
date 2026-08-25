import type { useRowSelection } from '~/components/table/use-row-selection';

import {
	type KnownInvitationAccountLevel,
	type KnownInvitationStatus,
	parseInvitationAccountLevelFilter,
	parseInvitationStatusFilter,
	serializeInvitationAccountLevelFilter,
	serializeInvitationStatusFilter,
} from '../../invitations/list-helpers';
import { formatTenantInvitationStatusLabel } from './_invitation-columns';
import type { InvitationRouteSearchParams } from './_invitations-route-search';
import { formatTenantUserLevelLabel } from './_tenant-details-shell';

/** Row-selection state returned by `useRowSelection`. */
type RowSelection = ReturnType<typeof useRowSelection>;

/** Prop bundle for the status/account-level dropdown pair rendered at the
 * far end of the table toolbar (`_invitation-toolbar-filters`). */
type InvitationsToolbarState = {
	selectedStatuses: KnownInvitationStatus[];
	selectedLevels: KnownInvitationAccountLevel[];
	statusFilterLabel: string;
	levelFilterLabel: string;
	/** #838: filters lock while row-selection mode is active. */
	selectionLocked: boolean;
	onSetStatuses: (nextStatuses: KnownInvitationStatus[]) => void;
	onToggleStatus: (status: KnownInvitationStatus) => void;
	onSetLevels: (nextLevels: KnownInvitationAccountLevel[]) => void;
	onToggleLevel: (level: KnownInvitationAccountLevel) => void;
};

export type InvitationsFilterState = {
	selectedStatuses: KnownInvitationStatus[];
	selectedLevels: KnownInvitationAccountLevel[];
	statusFilterLabel: string;
	levelFilterLabel: string;
	setStatuses: (nextStatuses: KnownInvitationStatus[]) => void;
	toggleStatus: (status: KnownInvitationStatus) => void;
	setLevels: (nextLevels: KnownInvitationAccountLevel[]) => void;
	toggleLevel: (level: KnownInvitationAccountLevel) => void;
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

/** Status/account-level filter selection, labels and toggles for the tenant
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
	const selectedLevels = parseInvitationAccountLevelFilter(search.level);

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

	const setLevels = (nextLevels: KnownInvitationAccountLevel[]): void => {
		applySearch({
			...search,
			level: serializeInvitationAccountLevelFilter(nextLevels),
			cursor: undefined,
		});
	};

	const toggleLevel = (level: KnownInvitationAccountLevel): void => {
		if (selectedLevels.includes(level)) {
			setLevels(selectedLevels.filter((value) => value !== level));
			return;
		}

		setLevels([...selectedLevels, level]);
	};

	const statusFilterLabel =
		selectedStatuses.length === 0
			? t('all-statuses')
			: selectedStatuses
					.map((status) => formatTenantInvitationStatusLabel(status, t))
					.join(', ');

	const levelFilterLabel =
		selectedLevels.length === 0
			? t('all-account-levels')
			: selectedLevels
					.map((level) => formatTenantUserLevelLabel(level, t))
					.join(', ');

	return {
		selectedStatuses,
		selectedLevels,
		statusFilterLabel,
		levelFilterLabel,
		setStatuses,
		toggleStatus,
		setLevels,
		toggleLevel,
		selection,
		toolbar: {
			selectedStatuses,
			selectedLevels,
			statusFilterLabel,
			levelFilterLabel,
			selectionLocked: selection.isSelectionMode,
			onSetStatuses: setStatuses,
			onToggleStatus: toggleStatus,
			onSetLevels: setLevels,
			onToggleLevel: toggleLevel,
		},
	};
};
