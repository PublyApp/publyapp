import _ from 'lodash';
import auth from 'parse-server/lib/Auth.js';
import { UsersRouter } from 'parse-server/lib/Routers/UsersRouter.js';
import type { ParsedQs } from 'qs';
import { getInternalConfig } from '@/server/lib/parse/parse.utils';
import { encodeString } from '@/server/utils/string.utils';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import type { IUser } from '@/shared/types/db/user.types';

type AuthCloudServiceProps = {
	sessionToken: string | ParsedQs | string[] | ParsedQs[];
};

export class AuthCloudService {
	readonly sessionToken: string | ParsedQs | string[] | ParsedQs[];

	// biome-ignore lint/suspicious/noExplicitAny: use any for now (TODO: add type definition)
	private auth: any;

	private constructor({ sessionToken }: AuthCloudServiceProps) {
		this.sessionToken = sessionToken;
	}

	static async createAuthCloudService({ sessionToken }: AuthCloudServiceProps) {
		const instance = new AuthCloudService({ sessionToken });
		await instance.initialize();
		return instance;
	}

	private async initialize() {
		const config = getInternalConfig();
		this.auth = await auth.getAuthForSessionToken({
			config,
			sessionToken: this.sessionToken,
		});
	}

	/**
	 * get user by session token
	 */
	async getUserForSessionToken(): Promise<Parse.User> {
		return this.auth.user;
	}

	/**
	 * get all roles names including the inherited ones
	 */
	async getRoleNamesForSessionToken(): Promise<string[]> {
		return ((await this.auth.getUserRoles()) as string[])
			.filter((role) => _.startsWith(role, 'role:'))
			.map((role) => role.replace('role:', ''));
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
		const _auth = { isMaster: true };

		const config = getInternalConfig();

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

	static async getCustomVerificationLink({
		token,
		email,
		serverUrl,
	}: {
		token: string;
		email: string;
		serverUrl: string;
	}) {
		const url = new URL(serverUrl);
		// url.pathname = endPoint.api.auth.verifyEmail; // do not use a server endpoint
		url.pathname = FRONT_PATH_NAMES.auth.verifyEmail; // use a front-end pathname instead
		url.searchParams.set('token', token);

		url.searchParams.set('id', encodeString(_.toString(email)));

		return url.toString();
	}

	static async getCustomResetPasswordLink({
		token,
		email,
		serverUrl,
	}: {
		token: string;
		email: string;
		serverUrl: string;
	}) {
		const url = new URL(serverUrl);
		// url.pathname = endPoint.api.auth.resetPassword; // do not use a server endpoint
		url.pathname = FRONT_PATH_NAMES.auth.resetPassword; // use a front-end pathname instead
		url.searchParams.set('token', token);

		url.searchParams.set('id', encodeString(_.toString(email)));

		return url.toString();
	}
}
