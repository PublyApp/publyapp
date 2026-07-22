import z, { ZodError } from 'zod';

type ProcessEnv = { [key: string]: string | undefined };
type ProcessLike = { env?: ProcessEnv };
type RuntimePublicEnv = {
	PUBLIC_API_BASE_URL?: string;
};
type GlobalLike = {
	process?: ProcessLike;
	__ENV__?: RuntimePublicEnv;
};

const publicApiBaseUrlSchema = z.object({
	PUBLIC_API_BASE_URL: z.string().trim().min(1),
});
const serverApiBaseUrlSchema = z.object({
	SERVER_API_BASE_URL: z.string().trim().min(1),
});

const getGlobalLike = (): GlobalLike | undefined =>
	typeof globalThis === 'object' ? (globalThis as GlobalLike) : undefined;

const getProcessEnv = (): ProcessEnv => getGlobalLike()?.process?.env ?? {};

const trimOptional = (value: string | undefined): string | undefined => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
};

const parseZodSchema = <Schema extends z.ZodTypeAny>(
	schema: Schema,
	value: unknown,
	label: string,
): Readonly<z.infer<Schema>> => {
	try {
		return Object.freeze(schema.parse(value));
	} catch (error) {
		if (error instanceof ZodError) {
			throw new Error(
				`failed to validate ${label}: ${JSON.stringify(error.issues[0])}`,
			);
		}

		throw error;
	}
};

export const getOptionalPublicApiBaseUrl = (): string | undefined =>
	trimOptional(getGlobalLike()?.__ENV__?.PUBLIC_API_BASE_URL) ??
	trimOptional(getProcessEnv().PUBLIC_API_BASE_URL);

export const getPublicApiBaseUrl = (): string =>
	parseZodSchema(
		publicApiBaseUrlSchema,
		{ PUBLIC_API_BASE_URL: getOptionalPublicApiBaseUrl() },
		'front-2 public runtime env',
	).PUBLIC_API_BASE_URL;

export const getServerApiBaseUrl = (): string =>
	parseZodSchema(
		serverApiBaseUrlSchema,
		{ SERVER_API_BASE_URL: trimOptional(getProcessEnv().SERVER_API_BASE_URL) },
		'front-2 server runtime env',
	).SERVER_API_BASE_URL;

export const getPosthogProjectToken = (): string | undefined =>
	trimOptional(getProcessEnv().POSTHOG_PROJECT_TOKEN) ??
	trimOptional(getProcessEnv().PUBLIC_POSTHOG_PROJECT_TOKEN);

export const getNodeEnv = (): string | undefined =>
	trimOptional(getProcessEnv().NODE_ENV);

export const isDevelopmentRuntime = (): boolean =>
	getNodeEnv() === 'development';

export const isProductionRuntime = (): boolean => getNodeEnv() === 'production';
