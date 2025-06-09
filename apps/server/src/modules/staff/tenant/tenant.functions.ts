import { HttpException } from '@/server/exceptions/HttpException';
import {
	fromStaffMemberParseFunction,
	type FunctionParams,
	type FunctionReturn,
} from '@/server/lib/parse/cloud/function';
import { className, functionName, roleSet } from '@/shared/lib/constants';
import { getNewTenantSchemaServerSide } from '@org/shared/validations/tenant/tenant.validations';
import _ from 'lodash';
import ParseUser from '../../common/auth/user/user.class';
import { USE_MASTER_KEY } from '@/server/lib/constants';
import { getDatabase } from '@/server/lib/parse/parse.utils';

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

		// find users  by emails
		const users = await new Parse.Query(ParseUser)
			.containedIn(
				'email',
				params.initialUsers.map((u) => u.email),
			)
			.select(['email'])
			// it's ok to use master key here because this function is only called by staff members
			.findAll(USE_MASTER_KEY);

		// collect emails in a Map
		const usersMapById = new Map(users.map((u) => [u.id, u]));

		// find staff member roles laa at once
		const staffMemberRoles = await new Parse.Query(Parse.Role)
			.containedIn(
				'name',
				roleSet.STAFF_MEMBER.map((r) => r.name),
			)
			.select(['name'])
			// it's ok to use master key here because this function is only called by staff members
			.findAll(USE_MASTER_KEY);

		// find staff member roles that are associated with any user
		const aggregateResult = getDatabase()
			.collection(className._JOIN_USER_TO_ROLE)
			.aggregate([
				{
					$match: {
						// user objectId
						relatedId: {
							$in: users.map((u) => u.id),
						},
						// role objectId
						owningId: {
							$in: staffMemberRoles.map((r) => r.id),
						},
					},
				},
				{
					$group: {
						_id: '$relatedId',
						count: { $sum: 1 },
					},
				},
			]);

		// { _id: string; count: number; }[]
		const aggregateResultArray = await aggregateResult.toArray();

		if (!_.isEmpty(aggregateResultArray)) {
			const staffMemberEmails: string[] = [];
			_.forEach(aggregateResultArray, (result) => {
				staffMemberEmails.push(usersMapById.get(result._id)?.get('email'));
			});

			// return {
			// 	type: 'error',
			// 	'staff-member-emails': staffMemberEmails,
			// }
			throw new HttpException(
				400,
				t('cannot-create-tenant-with-staff-members'),
				{
					body: {
						'staff-member-emails': staffMemberEmails,
					},
				},
			);
		}

		return { params };
	},
});
