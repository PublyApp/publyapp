import type CustomZod from '@/shared/lib/zod/CustomZod';

export const getFolderNameSchema = (z: CustomZod) => {
	return z
		.string()
		.min(1)
		.refine((data) => {
			return data.indexOf('/') === -1;
		}, "folder name must no contain slashes ('/')");
};
