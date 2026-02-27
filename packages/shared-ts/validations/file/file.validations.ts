import type InterZod from '@org/shared-ts/lib/zod/InterZod';

export const getFolderNameSchema = (z: InterZod) => {
	return z
		.string()
		.min(1)
		.refine((data) => {
			return data.indexOf('/') === -1;
		}, "folder name must no contain slashes ('/')");
};
