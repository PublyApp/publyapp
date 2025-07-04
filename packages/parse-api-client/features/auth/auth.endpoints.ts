import _ from 'lodash';

import type { IUser } from '@org/shared/types/db/user.types';

import type {
	CheckEmailVerificationToken,
	// CheckEmailVerificationToken,
	GetIsDisabledSignup,
	GetRedirectCode,
	GetTenantAuthData,
	GetUserAuthData,
} from '@/server/modules/common/auth/auth.functions';
import { getProtectionHeaders } from '@/shared/lib/axios';
import {
	LOCALE_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
	endPoint,
	functionName,
} from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import BaseEndPoints, {
	type BaseEndPointsProps,
} from '../../classes/BaseEndPoints';

export default class AuthEndPoints extends BaseEndPoints {
	constructor({ parseRestClient }: BaseEndPointsProps) {
		super({ parseRestClient });

		this.passwordLogin = this.passwordLogin.bind(this);
		this.getRedirectCode = this.getRedirectCode.bind(this);
		this.verificationEmailRequest = this.verificationEmailRequest.bind(this);
		this.checkEmailVerificationToken =
			this.checkEmailVerificationToken.bind(this);
	}

	async getUserAuthData() {
		return this.parseRestClient.cloudRun<GetUserAuthData.Return>(
			functionName.auth.getUserAuthData,
		);
	}

	async getTenantAuthData(params: GetTenantAuthData.Params) {
		return this.parseRestClient.cloudRun<
			GetTenantAuthData.Return,
			GetTenantAuthData.Params
		>(functionName.auth.getTenantAuthData, {
			params,
		});
	}

	/**
	 * login with username/email and password
	 */
	async passwordLogin(
		params: (
			| { username: string; email?: undefined }
			| { email: string; username?: string }
		) & { password: string },
	) {
		const { password } = params;

		const headers = _.merge(getProtectionHeaders({}), {
			'X-Parse-Revocable-Session': '1',
			[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
			[LOCALE_HEADER_KEY]: this.parseRestClient.getHeader(LOCALE_HEADER_KEY),
		});

		const url = new URL(this.parseRestClient.serverUrl);
		let pathname = url.pathname;
		pathname = makePath(pathname, endPoint.api.auth.passwordLogin);
		url.pathname = pathname;

		return this.parseRestClient.http.post<IUser & { sessionToken: string }>(
			url.toString(),
			{ email: params.email, username: params.username, password },
			{ headers },
		);
	}

	/**
	 * sign up with username/email and password
	 */
	async passwordSignup(params: {
		email: string;
		username?: string;
		password: string;
		firstName?: string;
		lastName?: string;
	}) {
		const { email, password, username, firstName, lastName } = params;

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

	async verificationEmailRequest(params: { email: string }) {
		return this.parseRestClient.verificationEmailRequest(params);
	}

	async getIsDisabledSignup() {
		return this.parseRestClient.cloudRun<GetIsDisabledSignup.Return>(
			functionName.auth.getIsDisabledSignup,
		);
	}

	async logOut() {
		return this.parseRestClient.logOut();
	}

	async getRedirectCode({ tenantId }: { tenantId?: string } = {}) {
		return this.parseRestClient.cloudRun<
			GetRedirectCode.Return,
			GetRedirectCode.Params
		>(functionName.auth.getRedirectCode, {
			params: { tenantId },
		});
	}

	async checkEmailVerificationToken({
		email,
		token,
	}: { email: string; token: string }) {
		return this.parseRestClient.cloudRun<
			CheckEmailVerificationToken.Return,
			CheckEmailVerificationToken.Params
		>(functionName.auth.checkEmailVerificationToken, {
			params: { email, token },
		});
	}
}
