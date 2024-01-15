import z from 'zod';

import { numericStringSchema } from '@devist/shared/lib/zod';

export const envSchema = z.object({
	PORT: numericStringSchema.default('3000'),
	SERVER_URL: z.string(),
	DATABASE_URI: z.string(),
	REST_API_KEY: z.string(),
	EXPRESS_FILES_MOUNT_PATH: z.string(),
	// ===
	PARSE_APP_ID: z.string(),
	PARSE_PATH: z.string(),
	PARSE_SERVER_URL: z.string(),
	PARSE_MASTER_KEY: z.string(),
	// ===
	CLOUDINARY_NAME: z.string(),
	CLOUDINARY_API_KEY: z.string(),
	CLOUDINARY_API_SECRET: z.string(),
});

export type AppEnv = z.infer<typeof envSchema>;

// export const env: Readonly<AppEnv> = {} as AppEnv;
export const env: AppEnv = {} as AppEnv;

export const setAppEnv = (newEnv: AppEnv) => {
	Object.assign(env, newEnv);
};
