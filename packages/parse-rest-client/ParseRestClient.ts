import axios from 'axios';
import _ from 'lodash';

import { AxiosHttp, getProtectionHeaders } from '@devist/shared/lib/axios';
import { PARSE_APPLICATION_ID_HEADER_KEY, PARSE_SESSION_TOKEN_HEADER_KEY } from '@devist/shared/lib/constants';
import type { IUser } from '@devist/shared/types/db/user.types';

import ParseRestError from './ParseRestError';

type Props = {
	parseServerUrl: string;
	applicationId: string;
};

type RunOptions<P extends Record<string, unknown>> = {
	params?: P;
	sessionToken?: string;
	headers?: Record<string, unknown>;
};

export default class ParseRestClient {
	public readonly http: AxiosHttp;

	public readonly applicationId: string;

	public readonly parseServerUrl: string;

	public readonly serverUrl: string;

	public readonly parsePath: string;

	constructor({ parseServerUrl, applicationId }: Props) {
		this.parseServerUrl = parseServerUrl;

		const url = new URL(parseServerUrl);

		this.serverUrl = url.origin;

		// eslint-disable-next-line prefer-destructuring
		this.parsePath = url.pathname[1];

		const axiosInstance = axios.create({
			baseURL: this.parseServerUrl,
		});

		// set default headers
		axiosInstance.defaults.headers.common[PARSE_APPLICATION_ID_HEADER_KEY] = applicationId;

		// interceptors
		axiosInstance.interceptors.response.use(
			(response) => {
				return response;
			},
			(error: unknown) => {
				// return error;
				// !!! do not reject Promises here, throw errors instead !!!!
				// This error interceptor is very specific to the case of we are exclusively using Parse Server cloud functions via the REST API only

				if (_.isString(error)) {
					throw new Error(error);
				}

				if (axios.isAxiosError(error)) {
					const statusCode = _.toNumber(error.response?.status);
					const { code: errorCode, error: errorMessage, xCode } = error.response?.data ?? {};
					const parseCode = _.isNil(errorCode) ? -1 : errorCode;
					const message = errorMessage ?? error.message ?? 'Unknown Error';
					const code = xCode ?? error.code ?? 'ERR_UNKNOWN';

					throw new ParseRestError({ statusCode, parseCode, message, code });
				}

				if (_.isError(error)) {
					throw error;
				}

				throw new Error('Unknown error');
			},
		);

		this.http = new AxiosHttp(axiosInstance);
		this.applicationId = applicationId;
	}

	setHeader(key: string, value: string) {
		if (_.toLower(key) === _.toLower(PARSE_APPLICATION_ID_HEADER_KEY)) {
			throw new Error('You cannot set X-Parse-Application-Id header');
		}

		this.http.axios.defaults.headers.common[key] = value;
	}

	getHeader(key: string) {
		return this.http.axios.defaults.headers.common[key];
	}

	setSessionToken(token?: string) {
		this.setHeader(PARSE_SESSION_TOKEN_HEADER_KEY, token as never);
	}

	getSessionToken() {
		return this.http.axios.defaults.headers.common[PARSE_SESSION_TOKEN_HEADER_KEY];
	}

	/**
	 * run cloud function
	 */
	async cloudRun<R, P extends Record<string, unknown> = Record<string, unknown>>(
		functionName: string,
		options: RunOptions<P> = {},
	) {
		return this.http.post<R, P>(_.join(['/functions', functionName], '/'), options.params as never, {
			headers: getProtectionHeaders({ sessionToken: options.sessionToken }),
			transformResponse: [
				...(this.http.axios.defaults.transformResponse as never),
				(data: unknown) => {
					if (_.isObject(data) && 'result' in data) {
						return data.result;
					}

					return data;
				},
			],
		});
	}

	/**
	 * login with username/email and password
	 */
	async passwordLogin(
		input: ({ username: string; email?: undefined } | { email: string; username?: string }) & { password: string },
	) {
		const { password } = input;
		const identifier = input.email || input.username;

		const headers = _.merge(getProtectionHeaders({}), {
			'X-Parse-Revocable-Session': '1',
			[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
		});

		return this.http.post<IUser & { sessionToken: string }>('/login', { username: identifier, password }, { headers });
	}

	async logOut() {
		return this.http.post('/logout', {}, { headers: getProtectionHeaders({}) });
	}

	/**
	 * sign up with username/email and password
	 */
	async signUp(input: { email: string; password: string }) {
		const { email: username, password } = input;
		const headers = _.merge(getProtectionHeaders({}), {
			'X-Parse-Revocable-Session': '1',
			[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
		});

		// https://docs.parseplatform.org/rest/guide/#signing-up
		return this.http.post<IUser & { sessionToken?: string }>(
			'/users',
			{ username, password, email: username },
			{ headers },
		);
	}

	// https://docs.parseplatform.org/rest/guide/#verifying-emails
	async verificationEmailRequest(input: { email: string }) {
		return this.http.post('/verificationEmailRequest', { email: input.email });
	}
}
