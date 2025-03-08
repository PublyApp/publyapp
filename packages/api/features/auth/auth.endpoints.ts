import _ from 'lodash';

import type { IUser } from '@org/shared/types/db/user.types';

import type {
	GetIsDisabledSignupFunction,
	GetRedirectCodeFunction,
	GetTenantAuthDataFunction,
	GetUserAuthDataFunction,
} from '@/server/modules/common/auth/auth.functions';
import { getProtectionHeaders } from '@/shared/lib/axios';
import { endPoint, functionName, LOCALE_HEADER_KEY, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

import BaseEndPoints, { type BaseEndPointsProps } from '../../classes/BaseEndPoints';

export default class AuthEndPoints extends BaseEndPoints {
	constructor({ parseRestClient }: BaseEndPointsProps) {
		super({ parseRestClient });

		this.passwordLogin = this.passwordLogin.bind(this);
		this.getRedirectCode = this.getRedirectCode.bind(this);
	}

	async getUserAuthData() {
		return this.parseRestClient.cloudRun<GetUserAuthDataFunction.Return>(functionName.auth.getUserAuthData);
	}

	async getTenantAuthData(params: GetTenantAuthDataFunction.Params) {
		return this.parseRestClient.cloudRun<GetTenantAuthDataFunction.Return, GetTenantAuthDataFunction.Params>(
			functionName.auth.getTenantAuthData,
			{
				params,
			},
		);
	}

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

		return this.parseRestClient.http.post<IUser & { sessionToken: string }>(
			this.parseRestClient.serverUrl + endPoint.api.auth.passwordLogin,
			{ email: input.email, username: input.username, password },
			{ headers },
		);
	}

	/**
	 * sign up with username/email and password
	 */
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

		return this.parseRestClient.http.post<IUser & { sessionToken?: string }>(
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

	async getRedirectCode({ tenantId }: { tenantId?: string } = {}) {
		return this.parseRestClient.cloudRun<GetRedirectCodeFunction.Return, GetRedirectCodeFunction.Params>(
			functionName.auth.getRedirectCode,
			{
				params: { tenantId },
			},
		);
	}
}
