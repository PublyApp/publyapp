import { AxiosHttp, createInstance } from '@devist/ui-react/lib/axios/index';

import { env } from '../env';

const axiosInstance = createInstance(env.SERVER_URL);
export const http = new AxiosHttp(axiosInstance);
