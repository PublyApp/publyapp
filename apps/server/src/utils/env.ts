import z from 'zod';

const numericStringSchema = z
	.string()
	.refine(
		(v) => {
			const n = Number(v);
			return !Number.isNaN(n) && v?.length > 0;
		},
		{ message: 'Invalid number' },
	)
	.transform((v) => {
		return Number(v);
	});

export const envSchema = z.object({
	PORT: numericStringSchema,
	SERVER_URL: z.string(),
	DATABASE_URI: z.string(),
	REST_API_KEY: z.string(),
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

// const defaultPort = 1337;

// defaultEnv
export const env: AppEnv = {} as AppEnv;

export const setAppEnv = (newEnv: AppEnv) => {
	Object.assign(env, newEnv);
};
