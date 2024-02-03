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

export const protectRequest = ({
	sessionToken,
	restApiKey,
	applicationId,
	hasFile = false,
}: {
	sessionToken?: string;
	applicationId?: string;
	hasFile?: boolean;
	restApiKey?: string;
}): AxiosRequestConfig => {
	return {
		headers: {
			[DEVIST_REST_API_HEADER_KEY]: restApiKey,
			[PARSE_SESSION_TOKEN_HEADER_KEY]: sessionToken,
			[PARSE_APPLICATION_ID_HEADER_KEY]: applicationId,
			'Content-Type': hasFile ? 'multipart/form-data' : 'application/json',
		},
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
