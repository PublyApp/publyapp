import axios, { type AxiosRequestConfig } from 'axios';
import _ from 'lodash';

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

	private applicationId: string;

	constructor({ parseServerUrl, applicationId }: Props) {
		const axiosInstance = axios.create({
			baseURL: parseServerUrl,
		});

		axiosInstance.interceptors.response.use(
			(response) => {
				return response;
			},
			(error) => {
				console.log('🤢🤢🤢🤢');

				if (error.response?.status === 400) {
					const { code, error: errorMessage } = error.response.data;
					throw new ParseRestError(code, errorMessage);
				}

				return Promise.reject(error);
			},
		);

		this.http = new AxiosHttp(axiosInstance);
		this.applicationId = applicationId;
	}

	/**
	 * run cloud function
	 */
	async cloudRun<R, P extends Record<string, unknown> = Record<string, unknown>>(
		functionName: string,
		options: RunOptions<P> = {},
	) {
		const additionalConfig: AxiosRequestConfig = {
			transformResponse: (data, _headers, status) => {
				const iData = JSON.parse(data);

				if (status === 400) {
					return iData;
				}

				const { result } = iData;
				return result;
			},
		};

		return this.http.post<R, P>(
			_.join(['/functions', functionName], '/'),
			options.params as never,
			_.merge(
				protectRequest({ sessionToken: options.sessionToken, applicationId: this.applicationId }),
				additionalConfig,
			),
		);
	}
}
