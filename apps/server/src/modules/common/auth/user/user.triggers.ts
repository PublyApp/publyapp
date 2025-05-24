import _ from 'lodash';

import type { TFunction } from 'i18next';

import { roleEnum } from '@org/shared/lib/constants';

import { ADMIN_EMAILS, USE_MASTER_KEY } from '@/server/lib/constants';

import RoleService from '../role/role.service';
import { parseTriggerEnhanced } from '@/server/lib/parse/cloud/trigger';

// --------------------------------------------------------------------------------------//
//                                     BEFORE SAVE                                       //
// --------------------------------------------------------------------------------------//

// check if object ot save is new, set value into request context then returns the value
// const checkIsNew = async ({ req }: { req: Parse.Cloud.TriggerRequest<Parse.User> }) => {
// 	const userToSave = req.object;
// 	const isNew = !(await userToSave.exists());
// 	_.set(req, 'context.isNew', isNew);
// 	return isNew;
// };

// ! this only made sense because I wanted to implement built-in blog module
// ! After consideration, We will rey on some headless CMS solution instead for our blog
// const setUserACL = ({ req, isNew }: { req: Parse.Cloud.TriggerRequest<Parse.User>; isNew: boolean }) => {
// 	if (isNew) {
// 		const user = req.object;

// 		const acl = new Parse.ACL();
// 		acl.setPublicReadAccess(true);
// 		user.setACL(acl);
// 	}
// };

const beforeSaveUser = parseTriggerEnhanced<Parse.User>({
	trigger: async ({ req: _req }) => {
		// const isNew = await checkIsNew({ req });
		// setUserACL({ req, isNew });
	},
});

// --------------------------------------------------------------------------------------//
//                                      AFTER SAVE                                       //
// --------------------------------------------------------------------------------------//

// const autoAssignDefaultRole = async ({
// 	req,
// 	t,
// }: {
// 	req: Parse.Cloud.TriggerRequest<Parse.User>;
// 	t: TFunction;
// }) => {
// 	const isNew = _.get(req, 'context.isNew');

// 	if (!isNew) {
// 		return;
// 	}

// 	const userSaved = req.object;
// 	const email = userSaved.getEmail();

// 	if (!email) {
// 		// Normally this should never happen:
// 		// if an user has been successfully saved,
// 		// that means that it must have an email
// 		// it is our login policy (in our code)
// 		throw new Error(t('user-has-no-email'));
// 	}

// 	const roleService = new RoleService(USE_MASTER_KEY);

// 	const defaultRole = await roleService.findRoleByCode(
// 		roleEnum.AUTHED_USER.code,
// 	);

// 	if (!defaultRole) {
// 		throw new Error(t('item-not-found', { item: t('role') }));
// 	}

// 	await roleService.assignRoleToUser(userSaved, defaultRole);
// };

const autoAssignAdminRole = async ({
	req,
	t,
}: {
	req: Parse.Cloud.TriggerRequest<Parse.User>;
	t: TFunction;
}) => {
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
		const adminRole = await roleService.findRoleByCode(
			roleEnum.STAFF_ADMIN.code,
		);

		if (!adminRole) {
			throw new Error(t('item-not-found', { item: t('role') }));
		}

		await roleService.assignRoleToUser(userSaved, adminRole);
	}
};

const afterSaveUser = parseTriggerEnhanced<Parse.User>({
	trigger: async ({ req, t }) => {
		// const p1 = autoAssignDefaultRole({ req, t });
		const p2 = autoAssignAdminRole({ req, t });

		await Promise.all([/* p1, */ p2]);
	},
});

// --------------------------------------------------------------------------------------//
//                                     DEFINITIONS                                       //
// --------------------------------------------------------------------------------------//

Parse.Cloud.beforeSave(Parse.User, beforeSaveUser);
Parse.Cloud.afterSave(Parse.User, afterSaveUser);
