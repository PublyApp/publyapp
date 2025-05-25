import auth from 'parse-server/lib/Auth.js';
import { UsersRouter } from 'parse-server/lib/Routers/UsersRouter.js';
import dayjs from 'dayjs';
import type { ParsedQs } from 'qs';
import { USE_MASTER_KEY } from '@/server/lib/constants';
import { getDatabase, getInternalConfig } from '@/server/lib/parse/parse.utils';
import { className } from '@/shared/lib/constants';
import type { IUser } from '@/shared/types/db/user.types';
import _ from 'lodash';

type AuthCloudServiceProps = {
	sessionToken: string | ParsedQs | string[] | ParsedQs[];
};

export class AuthCloudService {
	readonly sessionToken: string | ParsedQs | string[] | ParsedQs[];

	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
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

	static async verifyEmailByToken({
		// username,
		token,
	}: {
		// username: string;
		token: string;
	}) {
		const findUserForEmailVerification = async () => {
			const query = new Parse.Query(className.USER).equalTo(
				'_email_verify_token',
				token,
			);
			// .equalTo('username', username);

			const toSelect = [
				'emailVerified',
				'_email_verify_token',
				'_email_verify_token_expires_at',
			];

			query.select(toSelect);
			return query.first(USE_MASTER_KEY);
		};

		const user = await findUserForEmailVerification();

		if (!user) {
			throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Invalid token');
		}

		const emailVerified = user.get('emailVerified');

		const setValuesOnSuccess = async () => {
			await getDatabase()
				.collection(className.USER)
				.updateOne(
					{ _id: user.id as never },
					{
						$set: { emailVerified: true },
						$unset: {
							_email_verify_token: 1,
							_email_verify_token_expires_at: 1,
						},
					},
				);
		};

		if (emailVerified === true) {
			await setValuesOnSuccess();
			return;
		}

		const _email_verify_token_expires_at = user.get(
			'_email_verify_token_expires_at',
		);

		if (_email_verify_token_expires_at) {
			const expirationTime = new dayjs.Dayjs(_email_verify_token_expires_at);

			if (expirationTime.diff() <= 0) {
				throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Token expired');
			}
		}

		await setValuesOnSuccess();
	}
}
