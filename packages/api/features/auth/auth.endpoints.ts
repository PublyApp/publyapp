import _ from 'lodash';

import type { IUser } from '@devist/shared/types/db/user.types';

import type { GetIsDisabledSignupFunction, GetUserAuthDataFunction } from '@/server/modules/common/auth/auth.functions';
import { defaultHttp, getProtectionHeaders } from '@/shared/lib/axios';
import { endPoint, functionName, LOCALE_HEADER_KEY, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

import BaseEndPoints from '../../classes/BaseEndPoints';

export default class AuthEndPoints extends BaseEndPoints {
	getUserAuthData = async ({ tenantId }: { tenantId?: string } = {}) => {
		return this.parseRestClient.cloudRun<GetUserAuthDataFunction.Return, GetUserAuthDataFunction.Params>(
			functionName.auth.getUserAuthData,
			{ params: { tenantId } },
		);
	};

	/**
	 * login with username/email and password
	 */
	async passwordLogin(
		input: ({ username: string; email?: undefined } | { email: string; username?: string }) & { password: string },
	) {
		const { password } = input;

		const headers = _.merge(getProtectionHeaders({}), {
			'X-Parse-Revocable-Session': '1',
			[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
			[LOCALE_HEADER_KEY]: this.parseRestClient.getHeader(LOCALE_HEADER_KEY),
		});

		return defaultHttp.post<IUser & { sessionToken: string }>(
			this.parseRestClient.serverUrl + endPoint.api.auth.passwordLogin,
			{ email: input.email, username: input.username, password },
			{ headers },
		);
	}

	async passwordSignup(input: {
		email: string;
		username?: string;
		password: string;
		firstName?: string;
		lastName?: string;
	}) {
		const { email, password, username, firstName, lastName } = input;

		const headers = _.merge(getProtectionHeaders({}), {
			'X-Parse-Revocable-Session': '1',
			[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
		});

		return defaultHttp.post<IUser & { sessionToken?: string }>(
			this.parseRestClient.serverUrl + endPoint.api.auth.passwordSignup,
			{ email, username, password, lastName, firstName },
			{ headers },
		);
	}

	async verificationEmailRequest(input: { email: string }) {
		return this.parseRestClient.verificationEmailRequest(input);
	}

	async getIsDisabledSignup() {
		return this.parseRestClient.cloudRun<GetIsDisabledSignupFunction.Return>(functionName.auth.getIsDisabledSignup);
	}

	async logOut() {
		return this.parseRestClient.logOut();
	}
}
