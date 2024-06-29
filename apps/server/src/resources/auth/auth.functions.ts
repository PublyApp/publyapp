import { getDatabase, parseFunctionEnhanced, type FunctionParams, type FunctionReturn } from '@/server/lib/parse/utils';
import { className, functionName } from '@/shared/lib/constants';

import RoleService from './role/role.service';

export namespace GetUserAuthDataFunction {
	export type Params = FunctionParams<typeof getUserAuthDataFunction>;
	export type Return = FunctionReturn<typeof getUserAuthDataFunction>;
}

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

Parse.Cloud.define(functionName.auth.getUserAuthData, getUserAuthDataFunction);

if (global.LOCAL) {
	const removeSeededUsers = parseFunctionEnhanced({
		action: async () => {
			const User = getDatabase().collection(className.USER);

			const result = await User.deleteMany({ seeded: true });

			return result;
		},
	});

	Parse.Cloud.define(functionName.auth.removeSeededUsers, removeSeededUsers);
}
