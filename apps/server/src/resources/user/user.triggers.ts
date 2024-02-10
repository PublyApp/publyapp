import { roleEnum } from '@devist/shared/lib/constants';

import { ADMIN_EMAILS } from '../../lib/constants';
import { parseTrigger } from '../../lib/parse';
import RoleUtils from '../role/role.utils';

Parse.Cloud.afterSave(
	Parse.User,
	parseTrigger({
		trigger: async ({ req, t }) => {
			const user = req.object as Parse.User;

			// --------------------------------------------------------------------------------------//
			//                                auto assign admin role                                //
			// --------------------------------------------------------------------------------------//
			const email = user.getEmail();

			if (!email) {
				// Normally this should never happen because if an user has been successfully saved that means that it must have an email
				throw new Error(t('common:userHasNoEmail'));
			}

			if (ADMIN_EMAILS.includes(email)) {
				const adminRole = await RoleUtils.findRoleByCode(roleEnum.STAFF_ADMIN.code, true);

				if (!adminRole) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					throw new Error(t('common:roleNotFound')!);
				}

				await RoleUtils.assignRoleToUser(user, adminRole, true);
			}
		},
	}),
);
