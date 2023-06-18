import { RolesEnum } from '@aktivpost/shared/utils/constants';

import { ADMIN_EMAILS } from '../../utils/constants';
import { parseFunction } from '../../utils/parse.utils';
import { assignRoleToUser, findRoleByCode } from '../../utils/role.utils';

Parse.Cloud.afterSave(
	Parse.User,
	parseFunction(async (req: Parse.Cloud.TriggerRequest) => {
		const user = req.object as Parse.User;

		// --------------------------------------------------------------------------------------//
		//                                auto assign admin role                                //
		// --------------------------------------------------------------------------------------//
		const email = user.getEmail();

		if (!email) {
			throw new Error('User has no email set!!');
		}

		if (ADMIN_EMAILS.includes(email)) {
			const adminRole = await findRoleByCode(RolesEnum.ADMIN, true);

			if (!adminRole) {
				throw new Error('Role cannot be found!!');
			}

			await assignRoleToUser(user, adminRole, true);
		}
	}),
);
