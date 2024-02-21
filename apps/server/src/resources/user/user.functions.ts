import { parseFrom } from '@/server/lib/parse';
import { functionName, roleSet } from '@/shared/lib/constants';

import RoleUtils from '../role/role.utils';

import UserService from './user.service';

const getUserAuthDataFunction = parseFrom({
	requireUser: true,
	allowedRoles: roleSet.ALL,
	action: async ({ req: _r, user }) => {
		const sessionToken = user.getSessionToken();

		const rolesPromises = RoleUtils.getUserRoles(user, true);
		const fetchUserPromise = new UserService({ sessionToken }).getById(user.id);

		return {
			user: await fetchUserPromise,
			roles: await rolesPromises,
			sessionToken,
		};
	},
});

Parse.Cloud.define(functionName.getUserAuthData, getUserAuthDataFunction);
