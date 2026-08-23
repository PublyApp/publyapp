import {
	type KnownInvitationAccountLevel,
	type KnownInvitationStatus,
	parseInvitationAccountLevelFilter,
	parseInvitationStatusFilter,
	serializeInvitationAccountLevelFilter,
	serializeInvitationStatusFilter,
} from '../../invitations/list-helpers';
import { formatTenantInvitationStatusLabel } from './_invitation-status-label';
import type { InvitationRouteSearchParams } from './_invitations-route-search';
import { formatTenantUserLevelLabel } from './_tenant-details-shell';

export type InvitationsFilterState = {
	selectedStatuses: KnownInvitationStatus[];
	selectedLevels: KnownInvitationAccountLevel[];
	statusFilterLabel: string;
	levelFilterLabel: string;
	setStatuses: (nextStatuses: KnownInvitationStatus[]) => void;
	toggleStatus: (status: KnownInvitationStatus) => void;
	setLevels: (nextLevels: KnownInvitationAccountLevel[]) => void;
	toggleLevel: (level: KnownInvitationAccountLevel) => void;
};

type BuildInvitationsFilterStateArgs = {
	search: InvitationRouteSearchParams;
	t: (key: string, options?: Record<string, unknown>) => string;
	applySearch: (next: InvitationRouteSearchParams) => void;
};

/** Status/account-level filter selection, labels and toggles for the tenant
 * invitations table. Split out of the route file for
 * `react-doctor/no-giant-component`; navigation semantics are unchanged —
 * every mutation resets the cursor and replaces the current history entry. */
export const buildInvitationsFilterState = ({
	search,
	t,
	applySearch,
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
	};
};
