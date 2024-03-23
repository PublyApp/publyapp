import axios from 'axios';
import _ from 'lodash';

import { AxiosHttp, protectRequest } from '@devist/shared/lib/axios';
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
	private http: AxiosHttp;

	public readonly applicationId: string;

	public readonly parseServerUrl: string;

	constructor({ parseServerUrl, applicationId }: Props) {
		this.parseServerUrl = parseServerUrl;

		const axiosInstance = axios.create({
			baseURL: this.parseServerUrl,
		});

		// set default headers
		axiosInstance.defaults.headers.common[PARSE_APPLICATION_ID_HEADER_KEY] = applicationId;

		// const defaultTransformer = axiosInstance.defaults.transformResponse;

		// axiosInstance.defaults.transformResponse = [
		// 	...toMerge,
		// 	(data) => {
		// 		console.log('🚫🚫🚫🚫🚫', data);

		// 		if (data?.result) {
		// 			return data.result;
		// 		}

		// 		return data;
		// 	},
		// ];

		// interceptors
		axiosInstance.interceptors.response.use(
			(response) => {
				// const { request } = response;

				// if (request instanceof XMLHttpRequest) {
				// 	if (request.responseURL.startsWith(`${this.parseServerUrl}/functions`)) {
				// 		response.data = response.data.result;
				// 	}
				// }

				return response;
			},
			(error) => {
				if (error.response?.status === 400) {
					const { code, error: errorMessage } = error.response.data;
					throw new ParseRestError(code, errorMessage);
				}

				if (error.response?.status === 403) {
					const { error: errorMessage } = error.response.data;
					throw new ParseRestError(-1, errorMessage);
				}

				return Promise.reject(error);
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
		return this.http.post<R, P>(
			_.join(['/functions', functionName], '/'),
			options.params as never,
			_.merge(protectRequest({ sessionToken: options.sessionToken }), {
				transformResponse: [
					...(this.http.axios.defaults.transformResponse as never),
					(data: unknown) => {
						if (_.isObject(data) && 'result' in data) {
							return data.result;
						}

						return data;
					},
				],
			}),
		);
	}

	/**
	 * login with username/email and password
	 */
	async passwordLogin(username: string, password: string) {
		return this.http.post<IUser & { sessionToken: string }>(
			'/login',
			{ username, password },
			_.merge(protectRequest({}), {
				'X-Parse-Revocable-Session': '1',
				[PARSE_SESSION_TOKEN_HEADER_KEY]: undefined,
			}),
		);
	}

	async logOut() {
		return this.http.post('/logout', {}, protectRequest({}));
	}
}
