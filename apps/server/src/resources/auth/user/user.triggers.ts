import type { TFunction } from 'i18next';

import { roleEnum } from '@devist/shared/lib/constants';

import { ADMIN_EMAILS, DISABLE_SIGNUP_CONFIG_KEY, USE_MASTER_KEY } from '@/server/lib/constants';
import { getGlobalConfig, parseTriggerEnhanced } from '@/server/lib/parse/utils';

import RoleService from '../role/role.service';

// const setPublicReadAccessOnUser = (user: Parse.User) => {
// 	// const userExists = await user.exists(USE_MASTER_KEY);

// 	let acl: Parse.ACL | undefined;

// 	acl = user.getACL();

// 	if (!acl) {
// 		acl = new Parse.ACL();
// 	}

// 	if (acl.getPublicReadAccess()) {
// 		// do nothing
// 	} else {
// 		acl.setPublicReadAccess(true);
// 	}
// };

const handleDisabledSignupConfig = async ({ req, t }: { req: Parse.Cloud.TriggerRequest; t: TFunction }) => {
	const globalConfig = await getGlobalConfig();
	const disabledSignup: boolean = globalConfig.get(DISABLE_SIGNUP_CONFIG_KEY);

	if (disabledSignup && !req.master) {
		throw new Error(t('new-signup-disabled'));
	}
};

// const setUsernameIfNotSpecified = (user: Parse.User) => {
// 	if (!user.getUsername()) {
// 		const username = `${user.getEmail()?.split('@')?.[0]}_${user.setUsername(nanoid(5))}`;
// 		user.setUsername(username);
// 	}
// };

const beforeSaveUser = parseTriggerEnhanced({
	trigger: async ({ req, t }) => {
		// const user = req.object as Parse.User;

		// setUsername(user);
		await handleDisabledSignupConfig({ req, t });
		// setPublicReadAccessOnUser(user); // TODO: this seems to no work, we must fix this (idea: direct call to mongodb driver in afterSave)
	},
});

const autoAssignAdminRole = async ({ user, t }: { user: Parse.User; t: TFunction }) => {
	const email = user.getEmail();

	if (!email) {
		// Normally this should never happen because if an user has been successfully saved that means that it must have an email
		throw new Error(t('user-has-no-email'));
	}

	const roleService = new RoleService(USE_MASTER_KEY);

	if (ADMIN_EMAILS.includes(email)) {
		const adminRole = await roleService.findRoleByCode(roleEnum.STAFF_ADMIN.code);

		if (!adminRole) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			throw new Error(t('item-not-found', { item: t('role') })!);
		}

		await roleService.assignRoleToUser(user, adminRole);
	}
};

const afterSaveUser = parseTriggerEnhanced({
	trigger: async ({ req, t }) => {
		const user = req.object as Parse.User;

		// --------------------------------------------------------------------------------------//
		//                                auto assign admin role                                 //
		// ------------------------------------------------------------------------------------- //
		await autoAssignAdminRole({ user, t });
	},
});

Parse.Cloud.beforeSave(Parse.User, beforeSaveUser);
Parse.Cloud.afterSave(Parse.User, afterSaveUser);
