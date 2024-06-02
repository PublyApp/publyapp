import _ from 'lodash';

import type { IUser } from '@devist/shared/types/db/user.types';

import type { GetUserAuthDataFunction } from '@/server/resources/auth/user/user.functions';
import { defaultHttp, getProtectionHeaders } from '@/shared/lib/axios';
import { endPoint, functionName, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

import BaseEndPoints from '../BaseEndPoints';

export default class UserEndPoints extends BaseEndPoints {
	// constructor({ parseRestClient, apiPath}: BaseEndPointsProps) {}

	getUserAuthData = async () => {
		return this.parseRestClient.cloudRun<GetUserAuthDataFunction.Return, GetUserAuthDataFunction.Params>(
			functionName.getUserAuthData,
		);
	};

	/**
	 * login with username/email and password
	 */
	async passwordLogin(
		input: ({ username: string; email?: undefined } | { email: string; username?: string }) & { password: string },
	) {
		const { password } = input;
		// const identifier = input.email || input.username;

		const headers = _.merge(getProtectionHeaders({}), {
			'X-Parse-Revocable-Session': '1',
			[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
		});

		return defaultHttp.post<IUser & { sessionToken: string }>(
			this.parseRestClient.serverUrl + endPoint.api(this.apiPath).auth.passwordLogin,
			{ email: input.email, username: input.username, password },
			{ headers },
		);
	}

	async passwordSignup(input: { email: string; username?: string; password: string }) {
		const { email, password, username } = input;

		const headers = _.merge(getProtectionHeaders({}), {
			'X-Parse-Revocable-Session': '1',
			[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
		});

		return defaultHttp.post<IUser & { sessionToken?: string }>(
			this.parseRestClient.serverUrl + endPoint.api(this.apiPath).auth.passwordLogin,
			{ email, username, password },
			{ headers },
		);
	}

	async logOut() {
		return this.parseRestClient.logOut();
	}
}
