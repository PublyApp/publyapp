import type { TFunction } from 'i18next';
import _ from 'lodash';

import { roleEnum } from '@devist/shared/lib/constants';

import { ADMIN_EMAILS, USE_MASTER_KEY } from '@/server/lib/constants';
import { parseTriggerEnhanced } from '@/server/lib/parse/utils';

import RoleService from '../role/role.service';
import ParseUserProfile from '../userProfile/userProfile.class';

// --------------------------------------------------------------------------------------//
//                                     BEFORE SAVE                                      //
// --------------------------------------------------------------------------------------//

const beforeSaveUser = parseTriggerEnhanced<Parse.User>({
	trigger: async ({ req }) => {
		const userToSave = req.object;
		const isNew = !(await userToSave.exists());

		_.set(req, 'context.isNew', isNew);
	},
});

// --------------------------------------------------------------------------------------//
//                                      AFTER SAVE                                      //
// --------------------------------------------------------------------------------------//

const autoAssignAdminRole = async ({ req, t }: { req: Parse.Cloud.TriggerRequest<Parse.User>; t: TFunction }) => {
	const userSaved = req.object;
	const email = userSaved.getEmail();

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

		await roleService.assignRoleToUser(userSaved, adminRole);
	}
};

const createUserProfile = async ({ req }: { req: Parse.Cloud.TriggerRequest<Parse.User> }) => {
	const isNew = _.get(req, 'context.isNew');

	if (!_.isBoolean(isNew) || _.isEqual(isNew, false)) {
		return;
	}

	const userSaved = req.object as Parse.User;

	const profile = new ParseUserProfile({
		user: userSaved,
		username: userSaved.getUsername(),
	});

	await profile.save(null, {
		sessionToken: req.user?.getSessionToken(),
		useMasterKey: req.master,
	});
};

const afterSaveUser = parseTriggerEnhanced<Parse.User>({
	trigger: async ({ req, t }) => {
		await autoAssignAdminRole({ req, t });
		await createUserProfile({ req });
	},
});

Parse.Cloud.beforeSave(Parse.User, beforeSaveUser);
Parse.Cloud.afterSave(Parse.User, afterSaveUser);
