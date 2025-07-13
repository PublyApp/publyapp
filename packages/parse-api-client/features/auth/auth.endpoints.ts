import type { IUser } from '@org/shared/types/db/user.types';
import _ from 'lodash';

import type {
	CheckEmailVerificationToken,
	CheckResetPasswordToken,
	// CheckEmailVerificationToken,
	GetIsDisabledSignup,
	GetRedirectCode,
	GetTenantAuthData,
	GetUserAuthData,
	GetVerificationLink,
	RequestEmailVerification,
} from '@/server/modules/common/auth/auth.functions';
import { getProtectionHeaders } from '@/shared/lib/axios';
import {
	endPoint,
	functionName,
	LOCALE_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
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
		this.requestEmailVerification = this.requestEmailVerification.bind(this);
		this.checkEmailVerificationToken =
			this.checkEmailVerificationToken.bind(this);
		this.checkResetPasswordToken = this.checkResetPasswordToken.bind(this);
	}

	async getUserAuthData() {
		return this.parseRestClient.cloudRun<GetUserAuthData.Return>(
			functionName.auth.getUserAuthData,
		);
	}

	async getTenantAuthData({ tenantId }: { tenantId: string }) {
		return this.parseRestClient.cloudRun<
			GetTenantAuthData.Return,
			GetTenantAuthData.Params
		>(functionName.auth.getTenantAuthData, {
			params: { tenantId },
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

	async requestEmailVerification({ email }: { email: string }) {
		return this.parseRestClient.cloudRun<
			RequestEmailVerification.Return,
			RequestEmailVerification.Params
		>(functionName.auth.requestEmailVerification, {
			params: { email },
		});
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
		id,
		token,
	}: {
		id: string;
		token: string;
	}) {
		return this.parseRestClient.cloudRun<
			CheckEmailVerificationToken.Return,
			CheckEmailVerificationToken.Params
		>(functionName.auth.checkEmailVerificationToken, {
			params: { id, token },
		});
	}

	async getVerificationLink({ userId }: { userId: string }) {
		return this.parseRestClient.cloudRun<
			GetVerificationLink.Return,
			GetVerificationLink.Params
		>(functionName.auth.getVerificationLink, {
			params: { userId },
		});
	}

	async checkResetPasswordToken({ id, token }: { id: string; token: string }) {
		return this.parseRestClient.cloudRun<
			CheckResetPasswordToken.Return,
			CheckResetPasswordToken.Params
		>(functionName.auth.checkResetPasswordToken, {
			params: { id, token },
		});
	}
}
