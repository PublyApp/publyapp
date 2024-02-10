import { ParseUser } from '@/shared/lib/parse/classes/user.class';

type Props = {
	sessionToken: string | undefined;
};
export default class UserService {
	sessionToken?: string;

	constructor({ sessionToken }: Props) {
		this.sessionToken = sessionToken;
	}

	async getById(userId: string, options: { select?: string[] } = {}) {
		const query = new Parse.Query(ParseUser).equalTo('objectId', userId);

		if (options.select) {
			query.select(options.select);
		}

		return query.first({ sessionToken: this.sessionToken });
	}
}
