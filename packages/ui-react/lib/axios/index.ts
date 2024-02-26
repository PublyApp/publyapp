import axios from 'axios';
import _ from 'lodash';

export { AxiosHttp, protectRequest } from '@devist/parse-rest-client/lib/axios';

// ======
// the axios instance factory function
// ======
export const createInstance = (baseURL: string) => {
	return axios.create({
		baseURL,
	});
};
