import z, { ZodError } from 'zod';
import { deepFreeze } from '@/shared/utils/any.utils';

const envSchema = z.object({
	// VITE_SERVER_URL: z.string(),
	VITE_ASP_SERVER_URL: z.string(),
});

type AppEnv = z.infer<typeof envSchema>;

const dotEnv = {
	VITE_ASP_SERVER_URL: import.meta.env.VITE_ASP_SERVER_URL,
} satisfies Partial<AppEnv>;

const parseZodSchema = () => {
	try {
		return envSchema.parse(dotEnv);
	} catch (error) {
		if (error instanceof ZodError) {
			const err = new Error(
				`failed to validate .env: ${JSON.stringify(error.issues[0])}`,
			);
			throw err;
		}
		throw error;
	}
};

export const env = deepFreeze(parseZodSchema());
