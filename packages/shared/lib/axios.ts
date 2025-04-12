import _ from 'lodash';

import axios, {
	type AxiosInstance,
	type AxiosRequestConfig,
	type AxiosResponse,
} from 'axios';

import {
	PARSE_APPLICATION_ID_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
	REST_API_HEADER_KEY,
} from './constants';

export const createInstance = (baseURL?: string) => {
	return axios.create({
		baseURL,
	});
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

	async post<T, B = unknown>(
		url: string,
		body: B,
		config?: AxiosRequestConfig,
	) {
		return this.axios.post<T>(url, body, config).then(responseBody);
	}

	async put<T, B = unknown>(url: string, body: B, config?: AxiosRequestConfig) {
		return this.axios.put<T>(url, body, config).then(responseBody);
	}

	async delete<T>(url: string, config?: AxiosRequestConfig) {
		return this.axios.delete<T>(url, config).then(responseBody);
	}
}

export const getProtectionHeaders = (options: {
	sessionToken?: string;
	applicationId?: string;
	hasFile?: boolean;
	restApiKey?: string;
}): AxiosRequestConfig['headers'] => {
	const headers: AxiosRequestConfig['headers'] = {
		[REST_API_HEADER_KEY]: options.restApiKey,
		[PARSE_SESSION_TOKEN_HEADER_KEY]: options.sessionToken,
		[PARSE_APPLICATION_ID_HEADER_KEY]: options.applicationId,
		'Content-Type': options.hasFile
			? 'multipart/form-data'
			: 'application/json',
	};

	_.keys(headers).forEach((key) => {
		if (_.isNil((headers as never)[key])) {
			delete (headers as never)[key];
		}
	});

	return headers;
};

export const defaultHttp = new AxiosHttp(createInstance());
