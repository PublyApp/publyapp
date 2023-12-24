import z from 'zod';

const envSchema = z.object({
	SERVER_URL: z.string(),
	// // ===
	PARSE_APP_ID: z.string(),
	PARSE_SERVER_URL: z.string(),
	// PARSE_MASTER_KEY: z.string(), // ! never use the master key in a client environment
	// // ===
});

export type AppEnv = z.infer<typeof envSchema>;

const dotEnv = {
	SERVER_URL: process.env.SERVER_URL,
	PARSE_APP_ID: process.env.PARSE_APP_ID,
	PARSE_SERVER_URL: process.env.PARSE_SERVER_URL,
} satisfies Partial<AppEnv>;

export const env = envSchema.parse(dotEnv);
