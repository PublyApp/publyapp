import type { ZodI18n } from '@org/shared-ts/lib/zod/zod-i18n';

export const getFolderNameSchema = (z: ZodI18n) => {
	return z
		.string()
		.min(1)
		.refine((data) => {
			return data.indexOf('/') === -1;
		}, "folder name must no contain slashes ('/')");
};
