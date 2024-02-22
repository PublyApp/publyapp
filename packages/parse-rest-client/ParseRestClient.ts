import axios from 'axios';
import _ from 'lodash';

import { PARSE_APPLICATION_ID_HEADER_KEY, PARSE_SESSION_TOKEN_HEADER_KEY } from '@devist/shared/lib/constants';
import type { IUser } from '@devist/shared/types/db/user.types';
import { AxiosHttp, protectRequest } from '@devist/ui-react/lib/axios';

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

	constructor({ parseServerUrl, applicationId }: Props) {
		const axiosInstance = axios.create({
			baseURL: parseServerUrl,
		});

		// set default headers
		axiosInstance.defaults.headers.common[PARSE_APPLICATION_ID_HEADER_KEY] = applicationId;

		// interceptors
		axiosInstance.interceptors.response.use(
			(response) => {
				response.data = response.data.result;
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

	setSessionToken(token: string) {
		this.setHeader(PARSE_SESSION_TOKEN_HEADER_KEY, token);
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
			protectRequest({ sessionToken: options.sessionToken }),
		);
	}

	/**
	 * login with username/email and password
	 */
	async passwordLogin(username: string, password: string) {
		// todo use a custom login cloud function instead of the default login endpoint
		// because I think I'll want to return the user object with its relations populated someday
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
