import { USE_MASTER_KEY } from '@/server/lib/constants';
import { getDatabase } from '@/server/lib/parse/parse.utils';
import { className, roleSet } from '@/shared/lib/constants';
import _ from 'lodash';

// export interface StaffMemberValidationResult {
// 	code: 'SUCCESS' | 'FAILURE';
// 	'staff-member-emails': string[];
// }

export default class StaffTenantService {
	// constructor(
	// 	private readonly sessionToken: string,
	// 	private readonly useMasterKey: boolean,
	// ) { }

	// async getTenant(tenantId: string) {
	// 	const tenant = await new Parse.Query(ParseTenant).get(tenantId, {
	// 		sessionToken: this.sessionToken,
	// 	});
	// }

	/**
	 * Validates that none of the provided users belong to staff members
	 * @param users - Array of Parse User objects to validate
	 */
	async validateNoStaffMembersInUserList(users: Parse.User[]) {
		// collect emails in a Map
		const usersMapById = new Map(users.map((u) => [u.id, u]));

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

			return {
				code: 'FAILURE',
				'staff-member-emails': staffMemberEmails,
			} as const;
		}

		return {
			code: 'SUCCESS',
		} as const;
	}
}
