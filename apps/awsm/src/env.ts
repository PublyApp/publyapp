import z from 'zod';

import { numericStringSchema } from '@shared/lib/zod';

export const envSchema = z.object({
	PORT: numericStringSchema,
	SERVER_URL: z.string(),
	// ===
	PARSE_APP_ID: z.string(),
	PARSE_PATH: z.string(),
	PARSE_SERVER_URL: z.string(),
	PARSE_MASTER_KEY: z.string(),
	// ===
});

export type AppEnv = z.infer<typeof envSchema>;

export const env: AppEnv = {} as AppEnv;

export const setAppEnv = (newEnv: AppEnv) => {
	Object.assign(env, newEnv);
};
