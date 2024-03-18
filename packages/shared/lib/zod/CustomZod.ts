import type { TFunction } from 'i18next';
import z from 'zod';
import { makeZodI18nMap } from 'zod-i18n-map';

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
		return z.string({ ...params, errorMap: this.getErrorMap() });
	}

	enum(values: Readonly<Parameters<typeof z.enum>[0]>, params?: Parameters<typeof z.enum>[1]) {
		return z.enum(values, { ...params, errorMap: this.getErrorMap() });
	}
}

export default CustomZod;
