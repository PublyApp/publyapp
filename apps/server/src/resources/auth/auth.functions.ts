import { DISABLE_SIGNUP_CONFIG_KEY } from '@/server/lib/constants';
import {
	getDatabase,
	getGlobalConfig,
	parseFunctionEnhanced,
	type FunctionParams,
	type FunctionReturn,
} from '@/server/lib/parse/utils';
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

const removeSeededUsers = parseFunctionEnhanced({
	requireMasterKey: true,
	action: async () => {
		const User = getDatabase().collection(className.USER);

		const result = await User.deleteMany({ seeded: true });

		return result;
	},
});

Parse.Cloud.define(functionName.auth.removeSeededUsers, removeSeededUsers);

export namespace GetIsDisabledSignupFunction {
	// export type Params = FunctionParams<typeof getIsDisabledSignup>;
	export type Return = FunctionReturn<typeof getIsDisabledSignup>;
}

const getIsDisabledSignup = parseFunctionEnhanced({
	action: async () => {
		const globalConfig = await getGlobalConfig();
		const disabledSignup: boolean = globalConfig.get(DISABLE_SIGNUP_CONFIG_KEY);

		return { disabledSignup: Boolean(disabledSignup) };
	},
});

Parse.Cloud.define(functionName.auth.getIsDisabledSignup, getIsDisabledSignup);
