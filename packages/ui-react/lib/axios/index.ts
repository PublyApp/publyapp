import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

// ======
// the axios instance factory function
// ======
export const createInstance = (baseURL: string) => {
	return axios.create({
		baseURL,
	});
};

/**
 * set api bearer token header
 * @param {boolean} hasFile
 * @param {string} sessionToken // session token of the current user
 * @returns
 */
export const protectRequest = (sessionToken: string, hasFile = false): AxiosRequestConfig => {
	return {
		headers: {
			// 'X-1lalana-Key': import.meta.env.VITE_REST_API_KEY ?? '',
			'X-Parse-Session-Token': sessionToken,
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

	async post<I, T>(url: string, body: I, config?: AxiosRequestConfig) {
		return this.axios.post<T>(url, body, config).then(responseBody);
	}

	async put<I, T>(url: string, body: I, config?: AxiosRequestConfig) {
		return this.axios.put<T>(url, body, config).then(responseBody);
	}

	async delete<T>(url: string, config?: AxiosRequestConfig) {
		return this.axios.delete<T>(url, config).then(responseBody);
	}
}
