import { USE_MASTER_KEY } from '@/server/lib/constants';
import { getDatabase } from '@/server/lib/parse/parse.utils';
import { className, roleEnum } from '@/shared/lib/constants';

export default class UserManagementServiceForStaff {
	sessionToken?: string;

	constructor({ sessionToken }: { sessionToken: string | undefined }) {
		this.sessionToken = sessionToken;
	}

	static async findStaffUsersForStaffAdminTable() {
		const roleQuery = new Parse.Query(Parse.Role)
			.containedIn('name', [
				roleEnum.STAFF_ADMIN.name,
				roleEnum.STAFF_EDITOR.name,
				roleEnum.STAFF_USER.name,
				roleEnum.STAFF_CONTRIBUTOR.name,
				// roleEnum.TENANT_USER.name,
				// roleEnum.AUTHED_USER.name,
			])
			.select();
		const roles = await roleQuery.find(USE_MASTER_KEY);

		const roleIds = roles.map((role) => {
			return role.id;
		});

		const joinCollection = getDatabase().collection(className._JOIN_USER_TO_ROLE);

		const cursor = joinCollection.aggregate([
			{
				$match: {
					owningId: {
						$in: roleIds,
					},
				},
			},

			{
				$lookup: {
					from: '_Role', // Join with the Role collection
					let: {
						roleId: '$owningId',
					},
					pipeline: [
						{
							$match: { $expr: { $eq: ['$_id', '$$roleId'] } },
						},
						{
							$project: { name: 1, rank: 1 },
						},
					],
					as: 'roleDetails', // Alias for the joined role
				},
			},

			{ $unwind: '$roleDetails' },

			{
				$group: {
					_id: '$relatedId', // Group by user ID
					maxRank: { $max: '$roleDetails.rank' }, // Get the highest rank
					roles: {
						$addToSet: {
							name: '$roleDetails.name',
							id: '$roleDetails._id',
							rank: '$roleDetails.rank',
						},
					},
				},
			},

			// {
			// 	$sort: { maxRank: -1 }, // Sort users by their highest rank (descending)
			// },

			// TODO: skip and limit
		]);

		const result = await cursor.toArray();

		console.dir(
			// users.map((user) => {
			// 	return user.toJSON();
			// }),
			result,
			// roles.map((role) => {
			// 	return role.toJSON();
			// }),
			{ depth: null },
		);
		// new Parse.Query(ParseUser)
		// 	.select(['avatarUrl', 'username', 'email', 'firstName', 'lastName'])
		// 	.find(USE_MASTER_KEY);
	}
}
