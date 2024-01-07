import { ParseUser } from '@/shared/lib/parse/classes/user.class';

type Props = {
	sessionToken: string | undefined;
};
export default class UserService {
	sessionToken?: string;

	constructor({ sessionToken }: Props) {
		this.sessionToken = sessionToken;
	}

	async getById(userId: string) {
		return new Parse.Query(ParseUser).equalTo('objectId', userId).first({ sessionToken: this.sessionToken });
	}
}
