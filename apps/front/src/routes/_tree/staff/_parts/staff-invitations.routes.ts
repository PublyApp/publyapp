import { index, prefix, route } from '@react-router/dev/routes';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getLastPath } from '@org/shared-ts/utils/string.utils';

export const staffInvitationsRoutes = [
	...prefix(getLastPath(FRONT_PATH_NAMES.staff.invitations.root), [
		index(
			'routes/authed/staff/invitations/list/staff-invitations-list-page.tsx',
		),
		route(
			getLastPath(FRONT_PATH_NAMES.staff.invitations.new),
			'routes/authed/staff/invitations/new/new-staff-invitations-page.tsx',
		),
		route(
			getLastPath(
				FRONT_PATH_NAMES.staff.invitations.details(':invitationId'),
				2,
			),
			'routes/authed/staff/invitations/details/staff-invitation-details-page.tsx',
		),
	]),
];
