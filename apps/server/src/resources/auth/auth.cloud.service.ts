import Auth from 'parse-server/lib/Auth.js';
import Config from 'parse-server/lib/Config.js';
import Parse from 'parse/node.js';

import type { ParsedQs } from 'qs';

type AuthCloudServiceProps = {
	sessionToken: string | ParsedQs | string[] | ParsedQs[];
	// user?: Parse.User;
};

export class AuthCloudService {
	readonly sessionToken: string | ParsedQs | string[] | ParsedQs[];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
	async getUserForSessionToken(): Promise<Parse.User> {
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
