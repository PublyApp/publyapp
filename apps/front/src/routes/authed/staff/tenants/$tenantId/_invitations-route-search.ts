import {
	type InvitationListSearchParamInput,
	type InvitationListSearchParams,
	type InvitationListWireParams,
	parseInvitationAccountLevelFilter,
	parseInvitationListSearchParams,
	serializeInvitationAccountLevelFilter,
	serializeInvitationListSearchParams,
} from '../../invitations/list-helpers';
import {
	type InviteUserSearchState,
	type InviteUserSearchStateInput,
	parseInviteUserSearchParams,
	serializeInviteUserSearchParams,
} from './_invite-user-search-state';

export type InvitationRouteSearchParams = InvitationListSearchParams &
	InviteUserSearchState & {
		level?: string;
	};

export type InvitationRouteWireParams = InvitationListWireParams & {
	level?: string;
} & InviteUserSearchState;

export type InvitationRouteSearchParamInput = InvitationListSearchParamInput &
	InviteUserSearchStateInput & {
		level?: unknown;
	};

/** Route-level search contract for the staff tenant invitations page:
 * the shared invitation list params plus the invite-drawer flag plus this
 * slice's account-level filter. Split out of the route file for
 * `react-doctor/no-giant-component`; parsing semantics are unchanged. */
export const parseInvitationRouteSearchParams = (
	search: InvitationRouteSearchParamInput,
): InvitationRouteSearchParams => {
	const level = serializeInvitationAccountLevelFilter(
		parseInvitationAccountLevelFilter(search.level),
	);

	return {
		...parseInvitationListSearchParams(search),
		level: level || undefined,
		...parseInviteUserSearchParams(search),
	};
};

export const serializeInvitationRouteSearchParams = (
	search: InvitationRouteSearchParams,
): InvitationRouteWireParams => {
	const level = serializeInvitationAccountLevelFilter(
		parseInvitationAccountLevelFilter(search.level),
	);

	return {
		...serializeInvitationListSearchParams(search),
		level: level || undefined,
		...serializeInviteUserSearchParams(search),
	};
};
