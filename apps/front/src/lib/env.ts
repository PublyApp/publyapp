import z, { ZodError } from 'zod';

type ProcessEnv = { [key: string]: string | undefined };
type ProcessLike = { env?: ProcessEnv };
type GlobalLike = {
	process?: ProcessLike;
	window?: {
		__ENV__?: RuntimePublicEnv;
	};
};

type EnvEntry = {
	processKeys: readonly string[];
	schema: z.ZodType;
};

type PublicEnvEntry = EnvEntry & {
	wireKey: string;
};

type EnvDefinition = {
	public: Record<string, PublicEnvEntry>;
	server: Record<string, EnvEntry>;
};

const requiredTrimmedString = z.string().trim().min(1);
const optionalTrimmedString = z.string().trim().min(1).optional();
// PUBLIC_ORIGIN is used as a bare scheme+host base when building canonical
// and Open Graph URLs (`${origin}${requestPath}`). A trailing path segment —
// including the bare `/` of `https://example.com/` — produces double slashes
// or corrupts the URL. The schema's refine accepts only inputs that equal
// their own URL.origin (i.e. scheme://host), rejecting anything with a path,
// query, or fragment. This enforces the "no trailing path" contract surfaced
// by validateRuntimeEnv's error message.
const optionalPublicOrigin = z
	.url()
	.refine(
		(value) => {
			const parsed = new URL(value);
			return value === parsed.origin;
		},
		{
			message: 'PUBLIC_ORIGIN must be a bare scheme+host with no trailing path',
		},
	)
	.optional();

const envDefinition = {
	public: {
		apiBaseUrl: {
			wireKey: 'PUBLIC_API_BASE_URL',
			processKeys: ['PUBLIC_API_BASE_URL'],
			schema: requiredTrimmedString,
		},
		posthogProjectToken: {
			wireKey: 'PUBLIC_POSTHOG_PROJECT_TOKEN',
			// The canonical key wins when both are set. The unprefixed key is a
			// temporary server-only compatibility alias and is never sent as a
			// separate browser field.
			processKeys: ['PUBLIC_POSTHOG_PROJECT_TOKEN', 'POSTHOG_PROJECT_TOKEN'],
			schema: optionalTrimmedString,
		},
	},
	server: {
		publicOrigin: {
			processKeys: ['PUBLIC_ORIGIN'],
			schema: optionalPublicOrigin,
		},
		apiBaseUrl: {
			processKeys: ['SERVER_API_BASE_URL'],
			schema: requiredTrimmedString,
		},
		nodeEnv: {
			processKeys: ['NODE_ENV'],
			schema: optionalTrimmedString,
		},
	},
} as const satisfies EnvDefinition;

type PublicName = keyof typeof envDefinition.public;
type PublicWireKey = (typeof envDefinition.public)[PublicName]['wireKey'];
type ServerName = keyof typeof envDefinition.server;
type SchemaOutput<Entry extends EnvEntry> = z.output<Entry['schema']>;
type OptionalNames<Section extends Record<string, EnvEntry>> = {
	[Name in keyof Section]-?: undefined extends SchemaOutput<Section[Name]>
		? Name
		: never;
}[keyof Section];
type RequiredNames<Section extends Record<string, EnvEntry>> = Exclude<
	keyof Section,
	OptionalNames<Section>
>;
type EnvOutput<Section extends Record<string, EnvEntry>> = {
	[Name in RequiredNames<Section>]: SchemaOutput<Section[Name]>;
} & {
	[Name in OptionalNames<Section>]?: Exclude<
		SchemaOutput<Section[Name]>,
		undefined
	>;
};

export type PublicEnv = EnvOutput<typeof envDefinition.public>;
export type ServerEnv = EnvOutput<typeof envDefinition.server>;
export type RuntimePublicEnv = Partial<{
	[
		Name in PublicName as (typeof envDefinition.public)[Name]['wireKey']
	]: string;
}>;

const getGlobalLike = (): GlobalLike | undefined =>
	typeof globalThis === 'object' ? (globalThis as GlobalLike) : undefined;

const getProcessEnv = (): ProcessEnv => getGlobalLike()?.process?.env ?? {};

const isBrowser = (): boolean => typeof window !== 'undefined';

const parseZodSchema = <Schema extends z.ZodType>(
	schema: Schema,
	value: unknown,
	label: string,
	key: string,
): z.output<Schema> => {
	try {
		return schema.parse(value);
	} catch (error) {
		if (error instanceof ZodError) {
			const firstIssue = error.issues[0];
			const issue = firstIssue
				? { ...firstIssue, path: [key, ...firstIssue.path] }
				: undefined;
			throw new Error(`failed to validate ${label}: ${JSON.stringify(issue)}`);
		}

		throw error;
	}
};

const readFirstRawValue = (
	keys: readonly string[],
	getValue: (key: string) => string | undefined,
): string | undefined => {
	for (const key of keys) {
		const value = getValue(key)?.trim();
		if (value !== '' && value !== undefined) {
			return getValue(key);
		}
	}

	return undefined;
};

const readFirstProcessValue = (keys: readonly string[]): string | undefined => {
	const processEnv = getProcessEnv();
	return readFirstRawValue(keys, (key) => processEnv[key]);
};

const parsePublicEnv = (): PublicEnv => {
	const output: Record<string, string> = {};
	const runtimeEnv = getGlobalLike()?.window?.__ENV__;

	for (const name of Object.keys(envDefinition.public) as PublicName[]) {
		const entry = envDefinition.public[name];
		const rawValue = isBrowser()
			? readFirstRawValue(
					[entry.wireKey],
					(key) => runtimeEnv?.[key as keyof RuntimePublicEnv],
				)
			: readFirstProcessValue(entry.processKeys);
		const value = parseZodSchema(
			entry.schema,
			rawValue,
			'front public runtime env',
			entry.wireKey,
		);

		if (value !== undefined) {
			output[name] = value;
		}
	}

	return output as PublicEnv;
};

const parseServerEnv = (): ServerEnv => {
	const output: Record<string, string> = {};

	for (const name of Object.keys(envDefinition.server) as ServerName[]) {
		const entry = envDefinition.server[name];
		const value = parseZodSchema(
			entry.schema,
			readFirstProcessValue(entry.processKeys),
			'front server runtime env',
			entry.processKeys[0],
		);

		if (value !== undefined) {
			output[name] = value;
		}
	}

	return output as ServerEnv;
};

let publicMemo: Readonly<PublicEnv> | undefined;
let serverMemo: Readonly<ServerEnv> | undefined;

export const getPublicEnv = (): Readonly<PublicEnv> =>
	(publicMemo ??= Object.freeze(parsePublicEnv()));

export const getServerEnv = (): Readonly<ServerEnv> => {
	if (isBrowser()) {
		throw new Error('getServerEnv() must not be called in the browser');
	}

	return (serverMemo ??= Object.freeze(parseServerEnv()));
};

const toPublicWirePayload = (values: Readonly<PublicEnv>) => {
	const payload: Partial<Record<PublicWireKey, string>> = {};

	for (const name of Object.keys(envDefinition.public) as PublicName[]) {
		const entry = envDefinition.public[name];
		const value = values[name];
		if (value !== undefined) {
			payload[entry.wireKey] = value;
		}
	}

	return payload;
};

export const serializePublicRuntimeEnv = (): string =>
	JSON.stringify(toPublicWirePayload(getPublicEnv())).replace(/</g, '\\u003c');

export const isDevelopmentRuntime = (): boolean =>
	getServerEnv().nodeEnv === 'development';

export const isProductionRuntime = (): boolean =>
	getServerEnv().nodeEnv === 'production';
