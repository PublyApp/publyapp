// import type { TFunction } from 'i18next';
// import { z } from 'zod';

// export const getErrorMap: (t: TFunction, opts: { field: string }) => z.ZodErrorMap = (t, { field }) => {
// 	return (error, ctx) => {
// 		/*
// 		 * This is where you override the various error codes
// 		 */
// 		switch (error.code) {
// 			case z.ZodIssueCode.invalid_type: {
// 				if (error.expected === 'string') {
// 					return { message: t('form.error.invalidStringType', { field }) };
// 				}

// 				if (error.expected === 'number') {
// 					return { message: t('form.error.invalidNumberType', { field }) };
// 				}

// 				if (error.expected === 'boolean') {
// 					return { message: t('form.error.invalidBooleanType', { field }) };
// 				}

// 				break;
// 			}

// 			case z.ZodIssueCode.custom: {
// 				// produce a custom message using error.params
// 				// error.params won't be set unless you passed
// 				// a `params` arguments into a custom validator
// 				const params = error.params ?? {};

// 				if (params.myField) {
// 					return { message: `Bad input: ${params.myField}` };
// 				}

// 				break;
// 			}

// 			default: {
// 				// nothing
// 			}
// 		}

// 		// fall back to default message!
// 		return { message: ctx.defaultError };
// 	};
// };
