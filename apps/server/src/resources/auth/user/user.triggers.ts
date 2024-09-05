import type { TFunction } from 'i18next';
import _ from 'lodash';

import { roleEnum } from '@devist/shared/lib/constants';

import { ADMIN_EMAILS, USE_MASTER_KEY } from '@/server/lib/constants';
import { parseTriggerEnhanced } from '@/server/lib/parse/utils';

import RoleService from '../role/role.service';

// --------------------------------------------------------------------------------------//
//                                     BEFORE SAVE                                      //
// --------------------------------------------------------------------------------------//

const beforeSaveUser = parseTriggerEnhanced({
	trigger: async (/* { req } */) => {
		// do nothing for now
	},
});

// --------------------------------------------------------------------------------------//
//                                      AFTER SAVE                                      //
// --------------------------------------------------------------------------------------//

const autoAssignAdminRole = async ({ user, t }: { user: Parse.User; t: TFunction }) => {
	const email = user.getEmail();

	if (!email) {
		// Normally this should never happen:
		// if an user has been successfully saved,
		// that means that it must have an email
		// it is our login policy (in our code)
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
		const userSaved = req.object as Parse.User;

		await autoAssignAdminRole({ user: userSaved, t });
	},
});

Parse.Cloud.beforeSave(Parse.User, beforeSaveUser);
Parse.Cloud.afterSave(Parse.User, afterSaveUser);
