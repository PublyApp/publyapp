import type { i18n, TFunction, TOptions } from 'i18next';
import z, {
	defaultErrorMap,
	type Primitive,
	type RawCreateParams,
	type Writeable,
	type ZodArray,
	type ZodDiscriminatedUnionOption,
	type ZodEnum,
	type ZodErrorMap,
	ZodIssueCode,
	type ZodTypeAny,
} from 'zod';
import { makeZodI18nMap, type ZodI18nMapOption } from 'zod-i18n-map';

import { isServer } from '../constants';
import {
	NS,
	type AppLocale,
	type NameSpace,
	defaultLocale,
} from '../i18n/resources';

type I18nLike = {
	// getFixedT: (locale: AppLocale) => TFunction;
	// getFixedT: typeof i18next.getFixedT;
	getFixedT: SyncFunction;
	t?: TFunction;
};

/**
 * `TFunction`'s options parameter for dynamically-built calls: i18next's
 * strict overload demands a `defaultValue` whenever the key is not a
 * statically-known resource key, which is exactly the zod-error case.
 */
type DynamicTOptions = TOptions & { defaultValue: string };

/** Call a translation function with a runtime-computed key/options pair. */
const callT = (t: TFunction, key: string, options: DynamicTOptions): string =>
	t(key, options);

/**
 * Normalize a caller-supplied namespace (zod-i18n-map types it as any
 * string) to one of this package's resource namespaces, falling back when
 * the caller passes anything else.
 */
const toResourceNamespace = (
	value: string | readonly string[] | undefined,
	fallback: NameSpace,
): NameSpace => {
	const candidates = typeof value === 'string' ? [value] : [...(value ?? [])];
	const match = candidates.find((candidate): candidate is NameSpace =>
		(NS as readonly string[]).includes(candidate),
	);
	return match ?? fallback;
};

/**
 * Customizable by locale zod wrapper
 */
class InterZod {
	protected _i18n: I18nLike;

	protected _locale: AppLocale;

	protected _t: TFunction;

	public get t() {
		return this._t;
	}

	public get locale(): AppLocale {
		return this._locale;
	}

	public get i18n(): I18nLike {
		return this._i18n;
	}

	constructor({ i18n, locale }: { i18n: I18nLike; locale?: AppLocale }) {
		this._i18n = i18n;

		if (!locale) {
			this._locale = defaultLocale;
		} else {
			this._locale = locale;
		}

		if (isServer) {
			this._t = this._i18n.getFixedT(this._locale);
		} else {
			this._t = (this._i18n as i18n).t;
		}
	}

	setLocale(locale: AppLocale) {
		this._locale = locale;
		if (isServer) {
			this._t = this._i18n.getFixedT(this._locale);
		} else {
			this._t = (this._i18n as i18n).t;
		}
	}

	getErrorMap(option?: ZodI18nMapOption) {
		const errorMap1 = makeZodI18nMap({ t: this.t });

		const errorMap2: ZodErrorMap = (issue, ctx) => {
			const defaultNs: NameSpace = 'zod';
			const t = this.t;
			const ns = toResourceNamespace(option?.ns, defaultNs);
			const handlePath =
				option?.handlePath !== false
					? {
							context: option?.handlePath?.context ?? 'with_path',
							ns: toResourceNamespace(option?.handlePath?.ns, ns),
							keyPrefix: option?.handlePath?.keyPrefix,
						}
					: null;

			let message: string;
			message = defaultErrorMap(issue, ctx).message;

			const path =
				issue.path.length > 0 && handlePath !== null
					? {
							context: handlePath.context,
							path: callT(
								t,
								[handlePath.keyPrefix, issue.path.join('.')]
									.filter(Boolean)
									.join('.'),
								{
									ns: handlePath.ns,
									defaultValue: issue.path.join('.'),
								},
							),
						}
					: {};

			switch (issue.code) {
				case ZodIssueCode.invalid_type: {
					message = callT(t, 'errors.invalid_type', {
						expected: callT(t, `types.${issue.expected}`, {
							defaultValue: issue.expected,
							ns,
						}),
						received: callT(t, `types.${issue.received}`, {
							defaultValue: issue.received,
							ns,
						}),
						ns,
						defaultValue: message,
						...path,
					});
					break;
				}

				default: {
					const { message: _message } = errorMap1(issue, ctx);
					message = _message;
					break;
				}
			}

			return { message };
		};

		return errorMap2;
	}

	string(params?: Parameters<typeof z.string>[0]) {
		return z.string({ errorMap: this.getErrorMap(), ...params });
	}

	enum<U extends string, T extends Readonly<[U, ...U[]]>>(
		values: T,
		params?: RawCreateParams,
	): ZodEnum<Writeable<T>>;
	enum<U extends string, T extends [U, ...U[]]>(
		values: T,
		params?: RawCreateParams,
	): ZodEnum<T>;

	enum<U extends string, T extends [U, ...U[]]>(
		values: T,
		params?: RawCreateParams,
	): ZodEnum<T> {
		return z.enum(values, { errorMap: this.getErrorMap(), ...params });
	}

	object<T extends Parameters<typeof z.object>[0]>(
		schema: T,
		params?: Parameters<typeof z.object>[1],
	) {
		return z.object(schema, { errorMap: this.getErrorMap(), ...params });
	}

	date(params?: Parameters<typeof z.date>[0]) {
		return z.date({ errorMap: this.getErrorMap(), ...params });
	}

	number(params?: Parameters<typeof z.number>[0]) {
		return z.number({ errorMap: this.getErrorMap(), ...params });
	}

	// array<T extends ZodTypeAny>(schema: T, params?: RawCreateParams) => ZodArray<T>;
	array<T extends ZodTypeAny>(
		schema: T /* : Parameters<typeof z.array>[0] */,
		params?: RawCreateParams /*  Parameters<typeof z.array>[1], */,
	): ZodArray<T> {
		return z.array(schema, { errorMap: this.getErrorMap(), ...params });
	}

	boolean(params?: Parameters<typeof z.boolean>[0]) {
		return z.boolean({ errorMap: this.getErrorMap(), ...params });
	}

	discriminatedUnion<
		Discriminator extends string,
		Types extends [
			ZodDiscriminatedUnionOption<Discriminator>,
			...ZodDiscriminatedUnionOption<Discriminator>[],
		],
	>(discriminator: Discriminator, options: Types, params?: RawCreateParams) {
		return z.discriminatedUnion(discriminator, options, {
			errorMap: this.getErrorMap(),
			...params,
		});
	}

	literal<T extends Primitive>(value: T, params?: RawCreateParams) {
		return z.literal(value, { errorMap: this.getErrorMap(), ...params });
	}

	custom<T>(
		check?: Parameters<typeof z.custom>[0],
		params?: Parameters<typeof z.custom>[1],
	) {
		return z.custom<T>(check, params);
	}
}

export default InterZod;
