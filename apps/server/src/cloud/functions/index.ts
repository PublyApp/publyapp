import { RolesEnum } from '@aktivpost/shared/utils/constants';

import { parseFrom } from '../../utils/parse.utils';

Parse.Cloud.define(
	'hello',
	parseFrom({
		requireUser: true,
		allowedRoles: [RolesEnum.ADMIN, RolesEnum.MODERATOR, RolesEnum.AUTHOR, RolesEnum.READER],
		// allowedRoles: [],
		action: async (_req, _user, t) => {
			return t('common:hello');
		},
	}),
);
