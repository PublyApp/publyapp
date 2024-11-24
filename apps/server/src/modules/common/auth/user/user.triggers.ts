import type { TFunction } from 'i18next';
import _ from 'lodash';

import { roleEnum } from '@devist/shared/lib/constants';

import { ADMIN_EMAILS, USE_MASTER_KEY } from '@/server/lib/constants';
import { parseTriggerEnhanced } from '@/server/lib/parse/function.utils';

import RoleService from '../role/role.service';

// import ParseUserProfile from '../userProfile/userProfile.class';

// --------------------------------------------------------------------------------------//
//                                     BEFORE SAVE                                       //
// --------------------------------------------------------------------------------------//

// check if object ot save is new, set value into request context then returns the value
const checkIsNew = async ({ req }: { req: Parse.Cloud.TriggerRequest<Parse.User> }) => {
	const userToSave = req.object;
	const isNew = !(await userToSave.exists());
	_.set(req, 'context.isNew', isNew);
	return isNew;
};

const setUserACL = ({ req, isNew }: { req: Parse.Cloud.TriggerRequest<Parse.User>; isNew: boolean }) => {
	if (isNew) {
		const user = req.object;

		const acl = new Parse.ACL();
		acl.setPublicReadAccess(true);
		user.setACL(acl);
	}
};

const beforeSaveUser = parseTriggerEnhanced<Parse.User>({
	trigger: async ({ req }) => {
		const isNew = await checkIsNew({ req });
		setUserACL({ req, isNew });
	},
});

// --------------------------------------------------------------------------------------//
//                                      AFTER SAVE                                       //
// --------------------------------------------------------------------------------------//

const autoAssignDefaultRole = async ({ req, t }: { req: Parse.Cloud.TriggerRequest<Parse.User>; t: TFunction }) => {
	const isNew = _.get(req, 'context.isNew');

	if (!isNew) {
		return;
	}

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

	const defaultRole = await roleService.findRoleByCode(roleEnum.AUTHED_USER.code);

	if (!defaultRole) {
		throw new Error(t('item-not-found', { item: t('role') }));
	}

	await roleService.assignRoleToUser(userSaved, defaultRole);
};

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
			throw new Error(t('item-not-found', { item: t('role') }));
		}

		await roleService.assignRoleToUser(userSaved, adminRole);
	}
};

// const createUserProfile = async ({ req }: { req: Parse.Cloud.TriggerRequest<Parse.User> }) => {
// 	const isNew = _.get(req, 'context.isNew');

// 	if (!_.isEqual(isNew, true)) {
// 		return;
// 	}

// 	const isSeeded = req.object.get('seeded');

// 	if (isSeeded) {
// 		return;
// 	}

// 	const userSaved = req.object as Parse.User;

// 	const profile = new ParseUserProfile({
// 		user: userSaved,
// 		username: userSaved.getUsername(),
// 	});

// 	await profile.save(null, {
// 		sessionToken: req.user?.getSessionToken(),
// 		useMasterKey: req.master,
// 	});
// };

const afterSaveUser = parseTriggerEnhanced<Parse.User>({
	trigger: async ({ req, t }) => {
		const p1 = autoAssignDefaultRole({ req, t });
		const p2 = autoAssignAdminRole({ req, t });

		await Promise.all([p1, p2]);
		// await createUserProfile({ req });
	},
});

// --------------------------------------------------------------------------------------//
//                                     DEFINITIONS                                      //
// --------------------------------------------------------------------------------------//

Parse.Cloud.beforeSave(Parse.User, beforeSaveUser);
Parse.Cloud.afterSave(Parse.User, afterSaveUser);
