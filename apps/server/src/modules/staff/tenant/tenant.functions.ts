import { HttpException } from '@/server/exceptions/HttpException';
import { USE_MASTER_KEY } from '@/server/lib/constants';
import {
	type FunctionParams,
	type FunctionReturn,
	fromStaffMemberParseFunction,
} from '@/server/lib/parse/cloud/function';
import { X_CODE, functionName, roleSet } from '@/shared/lib/constants';
import { getNewTenantSchemaServerSide } from '@org/shared/validations/tenant/tenant.validations';
import _ from 'lodash';
import ParseUser from '../../common/auth/user/user.class';
import StaffTenantService from './staff-tenant.service';

export namespace CreateTenantFunction {
	export type Params = FunctionParams<typeof createTenant>;
	export type Return = FunctionReturn<typeof createTenant>;
}

export const createTenant = fromStaffMemberParseFunction({
	name: functionName.staff.tenant.create,
	allowedRoles: roleSet.STAFF_ADMIN_ONLY,
	validateParams: ({ params, z }) => {
		const maxUsers = Number(_.get(params, 'maxUsers'));
		let initialUsers = _.get(params, 'initialUsers');

		try {
			initialUsers = JSON.parse(initialUsers);
		} catch (error) {
			throw new HttpException(
				400,
				z.t('initial-users-must-be-a-valid-json-string'),
			);
		}

		return getNewTenantSchemaServerSide(z).parse({
			...params,
			maxUsers,
			initialUsers,
		});
	},
	action: async ({ params, t }) => {
		// verify if emails are associated with staff members
		// in our design, we don't allow staff members to be part of any tenant

		// find users by emails
		const users = await new Parse.Query(ParseUser)
			.containedIn(
				'email',
				params.initialUsers.map((u) => u.email),
			)
			.select(['email'])
			// it's ok to use master key here because this function is only called by staff members
			.findAll(USE_MASTER_KEY);

		const staffTenantService = new StaffTenantService();
		const validationResult =
			await staffTenantService.validateNoStaffMembersInUserList(users);

		if (validationResult.code === 'FAILURE') {
			throw new HttpException(
				400,
				t('cannot-create-tenant-with-staff-members'),
				{
					xcode: X_CODE.NO_STAFF_MEMBERS_ALLOWED_IN_TENANT,
					body: {
						'staff-member-emails': validationResult['staff-member-emails'],
					},
				},
			);
		}

		return { params };
	},
});
