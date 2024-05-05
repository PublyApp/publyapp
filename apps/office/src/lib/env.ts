import _ from 'lodash';
import z from 'zod';

import { deepFreeze } from '@/shared/utils/any.utils';

// import { checkIsBrowser, checkIsServer } from '@/shared/utils/env.utils';

const envSchema = z.object({
	SERVER_URL: z.string(),
	REST_API_KEY: z.string(),

	// =======================
	PARSE_APP_ID: z.string(),
	PARSE_SERVER_URL: z.string(),

	// =======================
	OFFICE_ROUTER_BASENAME: z.string(),

	// =======================
	FRONT_URL: z.string(),
});

export type AppEnv = z.infer<typeof envSchema>;

const dotEnv = {
	SERVER_URL: process.env.SERVER_URL,
	REST_API_KEY: process.env.REST_API_KEY,

	PARSE_APP_ID: process.env.PARSE_APP_ID,
	PARSE_SERVER_URL: process.env.PARSE_SERVER_URL,

	OFFICE_ROUTER_BASENAME: process.env.OFFICE_ROUTER_BASENAME,

	FRONT_URL: process.env.FRONT_URL,
} satisfies Partial<AppEnv>;

export const env = deepFreeze(envSchema.parse(dotEnv));
