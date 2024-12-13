import { USE_MASTER_KEY } from '@/server/lib/constants';
import { getDatabase } from '@/server/lib/parse/parse.utils';
import { applyQueryOptions } from '@/server/lib/parse/query.utils';
import ParseUser from '@/server/modules/common/auth/user/user.class';
import { className } from '@/shared/lib/constants';
import type { IUser } from '@/shared/types/db/user.types';

type Props = {
	sessionToken: string | undefined;
};
export default class UserService {
	sessionToken?: string;

	constructor({ sessionToken }: Props) {
		this.sessionToken = sessionToken;
	}

	async getById(
		userId: string,
		options: { select?: string[]; include?: string[]; json?: false | undefined },
	): Promise<ParseUser | undefined>;
	async getById(
		userId: string,
		options: { select?: string[]; include?: string[]; json: true },
	): Promise<IUser | undefined>;

	async getById(
		userId: string,
		options: { select?: string[]; include?: string[]; exclude?: string[]; json?: boolean } = {},
	) {
		const query = new Parse.Query(ParseUser).equalTo('objectId', userId);

		applyQueryOptions(query, options);

		const user = await query.first({ sessionToken: this.sessionToken });

		if (options.json) {
			return user?.toJSON() as unknown as IUser | undefined;
		}

		return user;
	}

	// eslint-disable-next-line class-methods-use-this
	async findUsersForStaffAdminTable() {
		const userQuery = new Parse.Query(ParseUser).select(['avatarUrl', 'username', 'email', 'firstName', 'lastName']);

		userQuery.find({ sessionToken: this.sessionToken });

		// pipeline for getting user ids with highest Role for each
		// example of dos returned
		// 	{
		// 		"_id" : "3OBikqa3Jk",
		// 		"maxRank" : NumberInt(100),
		// 		"maxRankRoleName" : "STAFF_EDITOR"
		// }
		// {
		// 		"_id" : "V9819SdKdc",
		// 		"maxRank" : NumberInt(100),
		// 		"maxRankRoleName" : "STAFF_ADMIN"
		// }
		getDatabase()
			.collection(className._JOIN_USER_TO_ROLE)
			.aggregate([
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
						maxRankRoleName: {
							// Store the role ID associated with the highest rank
							$first: {
								$cond: [{ $eq: ['$roleDetails.rank', { $max: '$roleDetails.rank' }] }, '$roleDetails.name', null],
							},
						},
					},
				},

				// {
				// 	$sort: { maxRank: -1 }, // Sort users by their highest rank (descending)
				// },

				// TODO: skip and limit
			]);

		const users = userQuery.find(USE_MASTER_KEY);

		return users;
	}
}
