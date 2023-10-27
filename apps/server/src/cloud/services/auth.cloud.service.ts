import type { User } from 'parse';
import Auth from 'parse-server/lib/Auth';
import Config from 'parse-server/lib/Config';

import type { ParsedQs } from 'qs';

type AuthCloudServiceProps = {
	sessionToken: string | ParsedQs | string[] | ParsedQs[];
	// user?: Parse.User;
};

export class AuthCloudService {
	readonly sessionToken: string | ParsedQs | string[] | ParsedQs[];

	private auth: any;

	private constructor({
		sessionToken,
	}: // user,
	AuthCloudServiceProps) {
		this.sessionToken = sessionToken;
	}

	static createAuthCloudService({ sessionToken }: AuthCloudServiceProps) {
		const instance = new AuthCloudService({ sessionToken });
		instance.initialize();
		return instance;
	}

	private async initialize() {
		const config = Config.get(Parse.applicationId);
		this.auth = Auth.getAuthForSessionToken({ config, sessionToken: this.sessionToken });
	}

	/**
	 * get user by session token
	 * @param {*} sessionToken
	 * @returns
	 */
	async getUserForSessionToken(): Promise<User> {
		return this.auth.user;
	}

	/**
	 * get all roles names including the inherited ones
	 */
	async getRoleNamesForSessionToken(): Promise<string[]> {
		return this.auth.getUserRoles();
	}

	/**
	 * Maybe get only the direct roles associated with the user
	 * Must verify this
	 */
	async getRolesForSessionToken(): Promise<Parse.Role[]> {
		return this.auth.getRolesForUser();
	}
}
