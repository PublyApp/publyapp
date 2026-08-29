/**
 * InterZod — i18n wrapper around zod v4.
 *
 * Replaces the retired `zod-i18n-map` package (v3-only). Message resolution
 * follows zod v4's own chain: an explicitly attached schema message wins,
 * otherwise the translated sentence for the issue is looked up in the `zod`
 * i18n namespace (bundles generated from zod's official locales by
 * `src/scripts/generate-zod-i18n-map.mjs`), falling back to zod's own
 * default sentence.
 */
import { z, type util } from 'zod';

import { isServer } from '../constants';
import { defaultLocale, type AppLocale } from '../i18n/resources';

/**
 * Structural stand-in for i18next's branded `TFunction`: InterZod only ever
 * calls `t(key, options)` with plain-string results, and requiring the brand
 * forced every hand-rolled translator (e.g. server-side identity stubs) to
 * carry i18next's internal `$TFunctionBrand` marker.
 */
type TranslateLike = (key: string, options?: Record<string, unknown>) => string;

export type InterZodTranslator = TranslateLike;

type I18nLike = {
	getFixedT: (locale: AppLocale) => TranslateLike;
	t?: TranslateLike;
};

/** Options for dynamically-built translation calls (key not statically known). */
type DynamicTOptions = Record<string, unknown> & { defaultValue: string };

/** Call a translation function with a runtime-computed key/options pair. */
const callT = (
	t: TranslateLike,
	key: string,
	options: DynamicTOptions,
): string => t(key, options);

export type InterZodErrorMap = (issue: IssueLike) => { message: string };

type IssueLike = {
	code?: string;
	expected?: string;
	origin?: string;
	input?: unknown;
	format?: string;
	inclusive?: boolean;
	minimum?: number | bigint;
	maximum?: number | bigint;
	multipleOf?: number | bigint;
	values?: unknown[];
	keys?: string[];
	pattern?: string;
	prefix?: string;
	suffix?: string;
	includes?: string;
	params?: { message?: string };
	message?: string;
};

/**
 * Mirror of zod core's `parsedType`: the display name for the received
 * value's kind, used to translate the `{{received}}` placeholder.
 */
const parsedType = (data: unknown): string => {
	if (typeof data === 'number') {
		if (Number.isNaN(data)) {
			return 'nan';
		}
		if (Number.isInteger(data)) {
			return 'int';
		}
		return 'number';
	}
	switch (typeof data) {
		case 'string':
		case 'boolean':
		case 'bigint':
		case 'symbol':
		case 'undefined':
		case 'function':
			return typeof data;
		case 'object': {
			if (data === null) {
				return 'null';
			}
			if (Array.isArray(data)) {
				return 'array';
			}
			if (data instanceof Date) {
				return 'date';
			}
			if (data instanceof Map) {
				return 'map';
			}
			if (data instanceof Set) {
				return 'set';
			}
			return 'object';
		}
		default:
			return 'unknown';
	}
};

const joinValues = (values: unknown[]): string =>
	values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join('|');

/**
 * Customizable by locale zod wrapper.
 *
 * The class keeps its v3-era shape (constructor + builder methods + `t`)
 * so every validation factory and call site survives the upgrade
 * unchanged; under v4 the error hook is global (`z.config`), so builder
 * methods no longer thread an `errorMap` option — they only normalize
 * params.
 */
class InterZod {
	protected _i18n: I18nLike;

	protected _locale: AppLocale;

	protected _t: TranslateLike;

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

		this._locale = locale ?? defaultLocale;

		if (isServer) {
			this._t = this._i18n.getFixedT(this._locale);
		} else {
			this._t = this._i18n.t ?? this._i18n.getFixedT(this._locale);
		}
	}

	setLocale(locale: AppLocale) {
		this._locale = locale;
		if (isServer) {
			this._t = this._i18n.getFixedT(this._locale);
		} else {
			this._t = this._i18n.t ?? this._i18n.getFixedT(this._locale);
		}
	}

	/** Translate a runtime-computed key inside the `zod` namespace. */
	private tz(key: string, options: DynamicTOptions): string {
		return callT(this._t, key, { ns: 'zod', ...options });
	}

	/**
	 * Build the translated message for a raw (unfinalized) v4 issue.
	 * Explicit schema messages win; everything else is looked up under
	 * `errors.*` with the code paths the v4 runtime emits.
	 */
	resolveMessage(issue: IssueLike): string {
		const explicit =
			issue.params?.message ??
			(typeof issue.message === 'string' && issue.message.length > 0
				? issue.message
				: undefined);
		if (explicit !== undefined && !explicit.startsWith('Invalid input')) {
			return explicit;
		}

		const fallback = explicit ?? 'Invalid input';

		switch (issue.code) {
			case 'invalid_type': {
				const expected = issue.expected ?? 'unknown';
				const received = parsedType(issue.input);
				return this.tz('errors.invalid_type', {
					defaultValue: fallback,
					expected: this.tz(`types.${expected}`, { defaultValue: expected }),
					received: this.tz(`types.${received}`, { defaultValue: received }),
				});
			}
			case 'invalid_value': {
				const values = issue.values ?? [];
				if (values.length === 1) {
					return this.tz('errors.invalid_literal', {
						defaultValue: fallback,
						value: String(values[0]),
					});
				}
				return this.tz('errors.invalid_enum_value', {
					defaultValue: fallback,
					options: joinValues(values),
					received:
						typeof issue.input === 'string'
							? `'${issue.input}'`
							: String(issue.input),
				});
			}
			case 'invalid_format': {
				const format = issue.format ?? '';
				let formatKey = format;
				if (format === 'starts_with') {
					formatKey = 'startsWith';
				} else if (format === 'ends_with') {
					formatKey = 'endsWith';
				}
				const key = `errors.invalid_format.${formatKey}`;
				return this.tz(key, {
					defaultValue: fallback,
					pattern: issue.pattern ?? '',
					prefix: issue.prefix ?? '',
					suffix: issue.suffix ?? '',
					includes: issue.includes ?? '',
				});
			}
			case 'too_small':
				return this.tz(
					`errors.too_small.${issue.origin ?? issue.expected ?? 'value'}.${
						issue.inclusive ? 'inclusive' : 'not_inclusive'
					}`,
					{ defaultValue: fallback, minimum: String(issue.minimum ?? '') },
				);
			case 'too_big':
				return this.tz(
					`errors.too_big.${issue.origin ?? issue.expected ?? 'value'}.${
						issue.inclusive ? 'inclusive' : 'not_inclusive'
					}`,
					{ defaultValue: fallback, maximum: String(issue.maximum ?? '') },
				);
			case 'unrecognized_keys':
				return this.tz('errors.unrecognized_keys', {
					defaultValue: fallback,
					keys: (issue.keys ?? []).join(', '),
				});
			case 'invalid_union':
				return this.tz('errors.invalid_union', { defaultValue: fallback });
			case 'not_multiple_of':
				return this.tz('errors.not_multiple_of', {
					defaultValue: fallback,
					multipleOf: String(issue.multipleOf ?? ''),
				});
			case 'invalid_date':
				return this.tz('errors.invalid_date', { defaultValue: fallback });
			case 'not_finite':
				return this.tz('errors.not_finite', { defaultValue: fallback });
			case 'custom':
				return this.tz('errors.custom', { defaultValue: fallback });
			default:
				return fallback;
		}
	}

	/**
	 * The v4 error hook, suitable for `z.config({ customError: ... })`.
	 * (The v3-era `z.setErrorMap` registration point is gone in v4.)
	 */
	getErrorMap(): InterZodErrorMap {
		return (issue) => ({ message: this.resolveMessage(issue) });
	}

	string(params?: Parameters<typeof z.string>[0]) {
		return z.string(params);
	}

	/**
	 * v4 promoted string formats to top-level functions (`z.email()` /
	 * `z.uuid()`); the chainable `.email()`/`.uuid()` string methods are
	 * deprecated. These builders keep `InterZod`-parameterised validators on
	 * the supported API while preserving the message-localization contract.
	 */
	email(params?: Parameters<typeof z.email>[0]): z.ZodEmail {
		return z.email(params);
	}

	uuid(params?: Parameters<typeof z.uuid>[0]): z.ZodUUID {
		return z.uuid(params);
	}

	enum<const T extends readonly string[]>(
		values: T,
		params?: string | z.core.$ZodEnumParams,
	): z.ZodEnum<z.util.ToEnum<T[number]>> {
		return z.enum(values, params);
	}

	// `FieldsIn` aliases zod core's own shape type so this wrapper stays
	// generic over arbitrary field maps without naming that type here.
	object<FieldsIn extends Record<string, z.core.$ZodType>>(
		fields: FieldsIn,
		params?: string | z.core.$ZodObjectParams,
	): z.ZodObject<util.Writeable<FieldsIn>, z.core.$strip> {
		return z.object(fields, params);
	}

	date(params?: Parameters<typeof z.date>[0]) {
		return z.date(params);
	}

	number(params?: Parameters<typeof z.number>[0]) {
		return z.number(params);
	}

	array<T extends z.core.$ZodType>(
		schema: T,
		params?: string | z.core.$ZodArrayParams,
	): z.ZodArray<T> {
		return z.array(schema, params);
	}

	boolean(params?: Parameters<typeof z.boolean>[0]) {
		return z.boolean(params);
	}

	discriminatedUnion<
		Discriminator extends string,
		Types extends readonly [
			z.core.$ZodTypeDiscriminable<Discriminator>,
			...z.core.$ZodTypeDiscriminable<Discriminator>[],
		],
	>(
		discriminator: Discriminator,
		options: Types,
		params?: Parameters<typeof z.discriminatedUnion>[2],
	) {
		return z.discriminatedUnion(discriminator, options, params);
	}

	literal<const T extends z.util.Literal>(
		value: T,
		params?: string | z.core.$ZodLiteralParams,
	) {
		return z.literal(value, params);
	}

	custom<T>(
		check?: Parameters<typeof z.custom>[0],
		params?: Parameters<typeof z.custom>[1],
	) {
		return z.custom<T>(check, params);
	}
}

export default InterZod;
