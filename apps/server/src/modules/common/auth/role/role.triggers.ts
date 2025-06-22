import { HttpException } from '@/server/exceptions/HttpException';
import { USE_MASTER_KEY } from '@/server/lib/constants';
import { parseTriggerEnhanced } from '@/server/lib/parse/cloud/trigger';
import StaffTenantService from '@/server/modules/staff/tenant/staff-tenant.service';
import { roleEnum, roleSet, staffRoleSet } from '@/shared/lib/constants';
import _ from 'lodash';

// --------------------------------------------------------------------------------------//
//                                     BEFORE SAVE                                       //
// --------------------------------------------------------------------------------------//

const beforeSaveRole = parseTriggerEnhanced<Parse.Role>({
	trigger: async ({ req, log, t }) => {
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

			const roleName = req.original?.get('name');

			let userIds: string[] = [];

			if (roleName) {
				const _users = _.get(json, 'users.objects');
				userIds = _.map(_users, (user) => user.objectId);
			}

			// if assigning TENANT_USER role to users
			if (roleName && roleName === roleEnum.TENANT_USER.name) {
				// check if any of the users is already a staff member
				const staffTenantService = new StaffTenantService();

				// find staff member roles at once
				const staffMemberRoles = await new Parse.Query(Parse.Role)
					.containedIn(
						'name',
						roleSet.STAFF_MEMBER.map((r) => r.name),
					)
					.select(['name'])
					// it's ok to use master key here because we are in a trigger
					.findAll(USE_MASTER_KEY);

				const userIdsWithStaffMemberRole =
					await staffTenantService.verifyIfAnyOfUsersHaveAnyOfRoles(
						userIds,
						staffMemberRoles,
					);

				if (!_.isEmpty(userIdsWithStaffMemberRole)) {
					throw new HttpException(
						400,
						t('some-users-already-members-of-the-staff'),
						{
							body: {
								userIds: userIdsWithStaffMemberRole,
							},
						},
					);
				}
			}

			// if assigning STAFF_**** role to users
			if (
				roleName &&
				_.values(staffRoleSet.STAFF_MEMBER).some(
					(role) => role.name === roleName,
				)
			) {
				// check if any of the users is already a tenant user
				// step 1: check if users has not the role: TENANT_USER
				// step 2: check if users have no relation with any tenant (look in the _CustomJoin:User:Tenant collection)

				// step 1: check if users has not the role: TENANT_USER
				const staffTenantService = new StaffTenantService();
				const tenantUserRole = await new Parse.Query(Parse.Role)
					.equalTo('name', roleEnum.TENANT_USER.name)
					.select([])
					// ok to use master key here because we ar in the scope of a trigger
					.first(USE_MASTER_KEY);

				if (!tenantUserRole) {
					throw new HttpException(500, t('Internal server error'), {
						meta: {
							reason: 'Tenant user role not found',
						},
					});
				}

				const userIdsWithTenantUserRole =
					await staffTenantService.verifyIfAnyOfUsersHaveAnyOfRoles(userIds, [
						tenantUserRole,
					]);

				if (!_.isEmpty(userIdsWithTenantUserRole)) {
					throw new HttpException(
						400,
						t('some-users-already-member-of-a-tenant'),
						{
							body: {
								userIds: userIdsWithTenantUserRole,
							},
							meta: {
								reason: `Some users has already the role: ${roleEnum.TENANT_USER.name}`,
							},
						},
					);
				}

				// step 2: check if users have no relation with any tenant (look in the _CustomJoin:User:Tenant collection)
				const userIdsWithTenant =
					await staffTenantService.verifyIfUsersHaveAnyTenant(userIds);

				if (!_.isEmpty(userIdsWithTenant)) {
					throw new HttpException(
						400,
						t('some-users-already-member-of-a-tenant'),
						{
							body: {
								userIds: userIdsWithTenant,
							},
							meta: {
								reason: 'Some users have already been assigned to a tenant',
							},
						},
					);
				}
			}
		}
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
