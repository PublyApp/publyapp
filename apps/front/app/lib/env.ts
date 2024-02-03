import z from 'zod';

const envSchema = z.object({
	VITE_SERVER_URL: z.string(),
	VITE_REST_API_KEY: z.string(),
	// // ===
	VITE_PARSE_APP_ID: z.string(),
	VITE_PARSE_SERVER_URL: z.string(),
	// PARSE_MASTER_KEY: z.string(), // ! never use the master key in a client environment
	// // ===
});

export type AppEnv = z.infer<typeof envSchema>;

// example of how to use env variables
// const testEnv = import.meta.env.VITE_TEST_ENV;
// console.log(testEnv);

const dotEnv = {
	VITE_SERVER_URL: import.meta.env.VITE_SERVER_URL,
	VITE_PARSE_APP_ID: import.meta.env.VITE_PARSE_APP_ID,
	VITE_PARSE_SERVER_URL: import.meta.env.VITE_PARSE_SERVER_URL,
	VITE_REST_API_KEY: import.meta.env.VITE_REST_API_KEY,
} satisfies Partial<AppEnv>;

export const env = envSchema.parse(dotEnv);
