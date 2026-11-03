import {
	type InvitationListSearchParamInput,
	type InvitationListSearchParams,
	type InvitationListWireParams,
	parseInvitationListSearchParams,
	serializeInvitationListSearchParams,
} from '../../invitations/list-helpers';
import {
	type InviteUserSearchState,
	type InviteUserSearchStateInput,
	parseInviteUserSearchParams,
	serializeInviteUserSearchParams,
} from './_invite-user-search-state';

export type InvitationRouteSearchParams = InvitationListSearchParams &
	InviteUserSearchState;

export type InvitationRouteWireParams = InvitationListWireParams &
	InviteUserSearchState;

export type InvitationRouteSearchParamInput = InvitationListSearchParamInput &
	InviteUserSearchStateInput;

/** Route-level search contract for the staff tenant invitations page:
 * the shared invitation list params plus the invite-drawer flag. Split out of
 * the route file for `react-doctor/no-giant-component`; parsing semantics are
 * unchanged. */
export const parseInvitationRouteSearchParams = (
	search: InvitationRouteSearchParamInput,
): InvitationRouteSearchParams => ({
	...parseInvitationListSearchParams(search),
	...parseInviteUserSearchParams(search),
});

export const serializeInvitationRouteSearchParams = (
	search: InvitationRouteSearchParams,
): InvitationRouteWireParams => ({
	...serializeInvitationListSearchParams(search),
	...serializeInviteUserSearchParams(search),
});
