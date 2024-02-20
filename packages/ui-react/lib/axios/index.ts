import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

import {
	DEVIST_REST_API_HEADER_KEY,
	PARSE_APPLICATION_ID_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
} from '@devist/shared/lib/constants';

// ======
// the axios instance factory function
// ======
export const createInstance = (baseURL: string) => {
	return axios.create({
		baseURL,
	});
};

export const protectRequest = (options: {
	sessionToken?: string;
	applicationId?: string;
	hasFile?: boolean;
	restApiKey?: string;
}): AxiosRequestConfig => {
	const headers: Record<string, unknown> = {
		'Content-Type': options.hasFile ? 'multipart/form-data' : 'application/json',
	};

	const mapper: Record<string, string> = {
		restApiKey: DEVIST_REST_API_HEADER_KEY,
		sessionToken: PARSE_SESSION_TOKEN_HEADER_KEY,
		applicationId: PARSE_APPLICATION_ID_HEADER_KEY,
	};

	for (const [key, value] of Object.entries(options)) {
		if (key === 'hasFile') {
			// eslint-disable-next-line no-continue
			continue;
		}

		if (value) {
			headers[mapper[key]] = value;
		}
	}

	return {
		headers: headers as never,
		// headers: {
		// 	[DEVIST_REST_API_HEADER_KEY]: restApiKey,
		// 	[PARSE_SESSION_TOKEN_HEADER_KEY]: sessionToken,
		// 	[PARSE_APPLICATION_ID_HEADER_KEY]: applicationId,
		// 	'Content-Type': hasFile ? 'multipart/form-data' : 'application/json',
		// },
	};
};

// get the data field response directly
const responseBody = <O>(response: AxiosResponse<O>) => {
	return response.data;
};

export class AxiosHttp {
	axios: AxiosInstance;

	constructor(axiosInstance: AxiosInstance) {
		this.axios = axiosInstance;
	}

	async get<T>(url: string, config?: AxiosRequestConfig) {
		return this.axios.get<T>(url, config).then(responseBody);
	}

	async post<T, B = unknown>(url: string, body: B, config?: AxiosRequestConfig) {
		return this.axios.post<T>(url, body, config).then(responseBody);
	}

	async put<T, B = unknown>(url: string, body: B, config?: AxiosRequestConfig) {
		return this.axios.put<T>(url, body, config).then(responseBody);
	}

	async delete<T>(url: string, config?: AxiosRequestConfig) {
		return this.axios.delete<T>(url, config).then(responseBody);
	}
}
