import { AxiosHttp, createInstance } from '@/shared/lib/axios';

import { env } from './env';

export const officeAxiosInstance = createInstance(env.SERVER_URL);
export const officeHttp = new AxiosHttp(officeAxiosInstance);
