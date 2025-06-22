import { USE_MASTER_KEY } from '@/server/lib/constants';
import { fetchAttributesOnObjects } from '@/server/lib/parse/parse-object';
import { getDatabase } from '@/server/lib/parse/parse.utils';
import { className, roleSet } from '@/shared/lib/constants';
import _ from 'lodash';

export default class StaffTenantService {
	// constructor(
	// 	private readonly sessionToken: string,
	// 	private readonly useMasterKey: boolean,
	// ) { }

	/**
	 * Verifies if any of the provided users have any of the specified roles
	 * @param users - Array of Parse User objects to check
	 * @param roles - Array of Parse Role objects to check against
	 * @returns Array of user IDs that have any of the specified roles
	 */
	async verifyIfAnyOfUsersHaveAnyOfRoles(
		users: Parse.User[] | string[],
		roles: Parse.Role[] | string[],
	) {
		const aggregateResult = getDatabase()
			.collection(className._JOIN_USER_TO_ROLE)
			.aggregate([
				{
					$match: {
						// user objectId
						relatedId: {
							$in: users.map((u) => {
								if (u instanceof Parse.Object) {
									return u.id;
								}
								return u;
							}),
						},
						// role objectId
						owningId: {
							$in: roles.map((r) => {
								if (r instanceof Parse.Object) {
									return r.id;
								}
								return r;
							}),
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

		// Return array of user IDs that have any of the specified roles
		return aggregateResultArray.map((result) => result._id as string);
	}

	/**
	 * Validates that none of the provided users belong to staff members
	 * @param users - Array of Parse User objects to validate
	 */
	async validateNoStaffMembersInUserList(users: Parse.User[]) {
		const _users = await fetchAttributesOnObjects(users, ['email']);

		// collect emails in a Map
		const usersMapById = new Map(_users.map((u) => [u.id, u]));

		// find staff member roles at once
		const staffMemberRoles = await new Parse.Query(Parse.Role)
			.containedIn(
				'name',
				roleSet.STAFF_MEMBER.map((r) => r.name),
			)
			.select(['name'])
			// it's ok to use master key here because this function is only called by staff members
			.findAll(USE_MASTER_KEY);

		// find staff member roles that are associated with any user
		const usersWithStaffRoles = await this.verifyIfAnyOfUsersHaveAnyOfRoles(
			_users.map((u) => u.id),
			staffMemberRoles,
		);

		if (!_.isEmpty(usersWithStaffRoles)) {
			const staffMemberEmails: string[] = [];
			_.forEach(usersWithStaffRoles, (userId) => {
				staffMemberEmails.push(usersMapById.get(userId)?.get('email'));
			});

			return {
				code: 'FAILURE',
				'staff-member-emails': staffMemberEmails,
				'staff-member-ids': usersWithStaffRoles,
			} as const;
		}

		return {
			code: 'SUCCESS',
		} as const;
	}

	async verifyIfUsersHaveAnyTenant(users: Parse.User[] | string[]) {
		const aggregateResult = getDatabase()
			.collection(className._CUSTOM_JOIN_USER_TO_TENANT)
			.aggregate([
				{
					$match: {
						_p_user: {
							$in: users.map((u) => {
								if (u instanceof Parse.Object) {
									return `${className.USER}:${u.id}`;
								}
								return `${className.USER}:${u}`;
							}),
						},
					},
				},
				{
					$group: {
						_id: '_p_user',
						count: { $sum: 1 },
					},
				},
			]);

		const aggregateResultArray = await aggregateResult.toArray();

		return aggregateResultArray.map((result) => result._id as string);
	}
}
