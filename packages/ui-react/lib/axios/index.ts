import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

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
	hasFile = false,
}: {
	sessionToken?: string;
	hasFile?: boolean;
	restApiKey?: string;
}): AxiosRequestConfig => {
	return {
		headers: {
			'X-Devist-Key': restApiKey,
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
