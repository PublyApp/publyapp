// eslint-disable-next-line import/extensions
import auth from 'parse-server/lib/Auth.js';
// eslint-disable-next-line import/extensions
import { UsersRouter } from 'parse-server/lib/Routers/UsersRouter.js';

// import Parse from 'parse/node.js';

import type { ParsedQs } from 'qs';

import { getConfig } from '@/server/lib/parse';
import type { IUser } from '@/shared/types/db/user.types';

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

	static async createAuthCloudService({ sessionToken }: AuthCloudServiceProps) {
		const instance = new AuthCloudService({ sessionToken });
		await instance.initialize();
		return instance;
	}

	private async initialize() {
		const config = getConfig();
		this.auth = await auth.getAuthForSessionToken({ config, sessionToken: this.sessionToken });
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

	static async authenticateUserWithPassword({
		usernameOrEmail,
		password,
	}: {
		usernameOrEmail: string;
		password: string;
	}) {
		// mimic auth object
		// eslint-disable-next-line @typescript-eslint/naming-convention
		const _auth = { isMaster: true };
		// new auth.Auth({});

		const config = getConfig();

		// const mimic req object
		const req = {
			config,
			auth: _auth,
			body: {
				username: usernameOrEmail,
				password,
			},
		};

		const usersRouter = new UsersRouter();
		const user: IUser = await usersRouter._authenticateUserFromRequest(req);

		return user;
	}
}
