import type { TFunction } from 'i18next';
import z, { number, type RawCreateParams, type Writeable, type ZodEnum } from 'zod';
import { makeZodI18nMap } from 'zod-i18n-map';

// type B = Parameters<typeof z.object>[1];
// type A = Parameters<typeof z.object>[0];

/**
 * Customizable by locale (pass i18n t function in constructor) zod
 */
class CustomZod {
	// errorMap: z.ZodErrorMap;
	t: TFunction;

	constructor(t: TFunction) {
		this.t = t;
	}

	getErrorMap() {
		return makeZodI18nMap({ t: this.t });
	}

	string(params?: Parameters<typeof z.string>) {
		return z.string({ errorMap: this.getErrorMap(), ...params });
	}

	enum<U extends string, T extends Readonly<[U, ...U[]]>>(values: T, params?: RawCreateParams): ZodEnum<Writeable<T>>;
	enum<U extends string, T extends [U, ...U[]]>(values: T, params?: RawCreateParams): ZodEnum<T>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	enum(values: any, params?: any) {
		return z.enum(values, { errorMap: this.getErrorMap(), ...params });
	}

	object<T extends Parameters<typeof z.object>[0]>(schema: T, params?: Parameters<typeof z.object>[1]) {
		return z.object(schema, { errorMap: this.getErrorMap(), ...params });
	}

	date(params?: Parameters<typeof z.date>) {
		return z.date({ errorMap: this.getErrorMap(), ...params });
	}

	number(params?: Parameters<typeof z.number>) {
		return number({ errorMap: this.getErrorMap(), ...params });
	}

	array(schema: Parameters<typeof z.array>[0], params?: Parameters<typeof z.array>[1]) {
		return z.array(schema, { errorMap: this.getErrorMap(), ...params });
	}

	boolean(params?: Parameters<typeof z.boolean>) {
		return z.boolean({ errorMap: this.getErrorMap(), ...params });
	}

	discriminatedUnion(
		discriminator: Parameters<typeof z.discriminatedUnion>[0],
		options: Parameters<typeof z.discriminatedUnion>[1],
		params?: Parameters<typeof z.discriminatedUnion>[2],
	) {
		return z.discriminatedUnion(discriminator, options, { errorMap: this.getErrorMap(), ...params });
	}

	literal(value: Parameters<typeof z.literal>[0], params?: Parameters<typeof z.literal>[1]) {
		return z.literal(value, { errorMap: this.getErrorMap(), ...params });
	}
}

export default CustomZod;
