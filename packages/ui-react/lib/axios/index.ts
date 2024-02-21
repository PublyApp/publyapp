import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import _ from 'lodash';

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
		[DEVIST_REST_API_HEADER_KEY]: options.restApiKey,
		[PARSE_SESSION_TOKEN_HEADER_KEY]: options.sessionToken,
		[PARSE_APPLICATION_ID_HEADER_KEY]: options.applicationId,
		'Content-Type': options.hasFile ? 'multipart/form-data' : 'application/json',
	};

	_.keys(headers).forEach((key) => {
		if (_.isNil(headers[key])) {
			delete headers[key];
		}
	});

	return {
		headers: headers as never,
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
