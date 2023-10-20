import type { User } from 'parse';
import Auth from 'parse-server/lib/Auth';
import Config from 'parse-server/lib/Config';

import type { ParsedQs } from 'qs';

export class AuthCloudService {
	public sessionToken: string | ParsedQs | string[] | ParsedQs[];

	constructor(sessionToken: string | ParsedQs | string[] | ParsedQs[]) {
		this.sessionToken = sessionToken;
	}

	/**
	 * get user by session token
	 * @param {*} sessionToken
	 * @returns
	 */
	public async getUserForSessionToken(): Promise<User> {
		const config = Config.get(Parse.applicationId);
		const auth = await Auth.getAuthForSessionToken({ config, sessionToken: this.sessionToken });
		return auth.user;
	}
}
