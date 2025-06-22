import { parseTriggerEnhanced } from '@/server/lib/parse/cloud/trigger';
import _ from 'lodash';

// --------------------------------------------------------------------------------------//
//                                     BEFORE SAVE                                       //
// --------------------------------------------------------------------------------------//

const beforeSaveRole = parseTriggerEnhanced<Parse.Role>({
	trigger: async ({ req, log }) => {
		log.debug('🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯', req.object.toJSON());
		log.debug('😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂', req.original?.toJSON());

		const json = req.object.toJSON();

		// Check if we are assigning a role to a user
		const isAddingRoleToUsers = _.get(json, 'users.__op') === 'AddRelation';

		if (isAddingRoleToUsers) {
			log.debug('============================================================');
			log.debug('  ⚠️⚠️⚠️ WARNING!!: updating users to role relation');
			log.debug('  please ensure all side effects are handled properly');
			log.debug(
				'  rule 1: staff members cannot be members of a tenant and vice-versa',
			);
			log.debug('  rule 2: do not forget to set roleData on the user object');
			log.debug(
				'  rule 3: do not forget to set isStaffMember on the user object (only necessary for staff member users)',
			);
			log.debug(
				'  rule 4: please add the new rules to this list if new requirements arise',
			);
			log.debug('============================================================');
		}

		// // Check if we are removing a role from a user
		// const isRemovingRoleFromUser = req.original?.get('users') &&
		// 	Array.isArray(req.original.get('users')) &&
		// 	req.original.get('users').length > req.object.get('users')?.length;

		// if (isRemovingRoleFromUser) {
		// 	log.debug('🗑️ Removing role from user(s)', {
		// 		roleName: req.object.get('name'),
		// 		previousUsers: req.original?.get('users'),
		// 		currentUsers: req.object.get('users'),
		// 	});
		// }
	},
});

// --------------------------------------------------------------------------------------//
//                                      AFTER SAVE                                       //
// --------------------------------------------------------------------------------------//

const afterSaveRole = parseTriggerEnhanced<Parse.Role>({
	trigger: async () => {
		// ====
	},
});

// --------------------------------------------------------------------------------------//
//                                     DEFINITIONS                                       //
// --------------------------------------------------------------------------------------//

Parse.Cloud.beforeSave(Parse.Role as never, beforeSaveRole);
Parse.Cloud.afterSave(Parse.Role as never, afterSaveRole);
