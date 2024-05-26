import { parseFunctionEnhanced } from '@/server/lib/parse/utils';
import { functionName } from '@/shared/lib/constants';

import RoleService from '../role/role.service';

const getUserAuthDataFunction = parseFunctionEnhanced({
	requireUser: true,
	action: async ({ user }) => {
		const sessionToken = user.getSessionToken();

		const rolesPromises = new RoleService({ sessionToken }).getUserRoles(user, true);

		return {
			user: user.toJSON(),
			roles: await rolesPromises,
			sessionToken,
		};
	},
});

Parse.Cloud.define(functionName.getUserAuthData, getUserAuthDataFunction);
