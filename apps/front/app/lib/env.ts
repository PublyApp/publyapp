import _ from 'lodash';
import z from 'zod';

import { deepFreeze } from '@/shared/utils/any.utils';

const envSchema = z.object({
	VITE_SERVER_URL: z.string(),
	VITE_REST_API_KEY: z.string(),
	VITE_API_PATH: z.string(),
	// ===
	VITE_PARSE_APP_ID: z.string(),
	VITE_PARSE_SERVER_URL: z.string(),
	VITE_PARSE_PATH: z.string(),
	// PARSE_MASTER_KEY: z.string(), // ! never use the master key in a client environment
	// ===
});

export type AppEnv = z.infer<typeof envSchema>;

const dotEnv = {
	VITE_SERVER_URL: import.meta.env.VITE_SERVER_URL,
	VITE_REST_API_KEY: import.meta.env.VITE_REST_API_KEY,
	VITE_API_PATH: import.meta.env.VITE_API_PATH,
	// ===
	VITE_PARSE_APP_ID: import.meta.env.VITE_PARSE_APP_ID,
	VITE_PARSE_SERVER_URL: import.meta.env.VITE_PARSE_SERVER_URL,
	VITE_PARSE_PATH: import.meta.env.VITE_PARSE_PATH,
	// ===
} satisfies Partial<AppEnv>;

export const env = deepFreeze(envSchema.parse(dotEnv));
