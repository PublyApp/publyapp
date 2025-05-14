import _ from 'lodash';

import axios from 'axios';

import { AxiosHttp, getProtectionHeaders } from '@org/shared/lib/axios';
import {
	PARSE_APPLICATION_ID_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
} from '@org/shared/lib/constants';
import type { IUser } from '@org/shared/types/db/user.types';

import ParseRestError from './ParseRestError';

type Props = {
	parseServerUrl: string;
	applicationId: string;
};

type RunOptions<P extends Record<string, unknown> | FormData> = {
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

		this.parsePath = url.pathname[1];

		const axiosInstance = axios.create({
			baseURL: this.parseServerUrl,
		});

		// set default headers
		axiosInstance.defaults.headers.common[PARSE_APPLICATION_ID_HEADER_KEY] =
			applicationId;

		// interceptors
		axiosInstance.interceptors.response.use(
			(response) => {
				return response;
			},
			(error: unknown) => {
				// !!! do not reject Promises here, throw errors instead !!!!
				// * This error interceptor can be used to handle errors globally
				// * Ensure that the error responses from your API is of the following type:
				// * { code: number; error: string; xcode?: string }
				// * in this application, on the server side, our error responses are of this type
				// * thanks to the generalized error handling middleware

				if (_.isString(error)) {
					throw new Error(error);
				}

				if (axios.isAxiosError(error)) {
					const httpStatusCode = error.response?.status || error.status || -1;
					const {
						code: errorCode,
						error: errorMessage,
						xcode,
					} = (error.response?.data as
						| Partial<{
								code: number;
								error: string;
								xcode: string;
						  }>
						| undefined) || {};
					const parseCode: number = errorCode || -1;
					const message: string =
						errorMessage || error.message || 'Unknown Error';
					const code: string = xcode || error.code || 'ERR_UNKNOWN';

					throw new ParseRestError({
						httpStatusCode,
						parseCode,
						message,
						code,
					});
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
		return this.http.axios.defaults.headers.common[
			PARSE_SESSION_TOKEN_HEADER_KEY
		];
	}

	/**
	 * run cloud function
	 */
	async cloudRun<
		R,
		P extends Record<string, unknown> | FormData = Record<string, unknown>,
	>(functionName: string, options: RunOptions<P> = {}) {
		return this.http.post<R, P>(
			_.join(['/functions', functionName], '/'),
			options.params as never,
			{
				headers: _.merge(
					getProtectionHeaders({ sessionToken: options.sessionToken }),
					options.headers || {},
				),
				transformResponse: [
					...(this.http.axios.defaults.transformResponse as never),
					(data: unknown) => {
						if (_.isObject(data) && 'result' in data) {
							return data.result;
						}

						return data;
					},
				],
			},
		);
	}

	/**
	 * login with username/email and password
	 */
	async passwordLogin(
		input: (
			| { username: string; email?: undefined }
			| { email: string; username?: string }
		) & { password: string },
	) {
		const { password } = input;
		const identifier = input.email || input.username;

		const headers = _.merge(getProtectionHeaders({}), {
			'X-Parse-Revocable-Session': '1',
			[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
		});

		return this.http.post<IUser & { sessionToken: string }>(
			'/login',
			{ username: identifier, password },
			{ headers },
		);
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
