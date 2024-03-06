import { parseFrom } from '@/server/lib/parse/utils';
import { functionName, roleSet } from '@/shared/lib/constants';

import RoleService from '../role/role.service';

const getUserAuthDataFunction = parseFrom({
	requireUser: true,
	allowedRoles: roleSet.ALL,
	action: async ({ req: _r, user }) => {
		const sessionToken = user.getSessionToken();

		const rolesPromises = new RoleService({ sessionToken }).getUserRoles(user, true);
		// const fetchUserPromise = new UserService({ sessionToken }).getById(user.id);

		// const [roles, iUser] = await Promise.all([rolesPromises, fetchUserPromise]);

		// console.log('[[[[[[[[[[[[', user.toJSON());

		return {
			// user: await fetchUserPromise,
			// roles: await rolesPromises,
			user: user.toJSON(),
			roles: await rolesPromises,
			sessionToken,
		};
	},
});

Parse.Cloud.define(functionName.getUserAuthData, getUserAuthDataFunction);
