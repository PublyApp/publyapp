import ParseUser  from '@/server/lib/parse/classes/user.class';
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

	async getById(userId: string, options: { select?: string[]; include?: string[]; json?: boolean } = {}) {
		const query = new Parse.Query(ParseUser).equalTo('objectId', userId);

		if (options.select) {
			query.select(options.select);
		}

		if (options.include) {
			query.include(options.include);
		}

		const user = await query.first({ sessionToken: this.sessionToken });

		if (options.json) {
			return user?.toJSON() as unknown as IUser | undefined;
		}

		return user;
	}
}
