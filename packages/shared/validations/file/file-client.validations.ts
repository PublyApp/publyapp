import type zod from 'zod';

import type InterZod from '@/shared/lib/zod/InterZod';

import { getFolderNameSchema } from './file.validations';

export const getFileSchemaClientSide = (z: InterZod) => {
	const field = z.t('field');
	const type = z.t('file');

	return z.custom<
		File & {
			preview?: string;
			appFileId?: string;
		}
	>(
		(data) => {
			return data instanceof File;
		},
		{
			message: z.t('item-is-not-instance-of-type', { item: field, type }),
		},
	);
};

export const getFilesArraySchemaClientSide = (z: InterZod) => {
	return z.array(getFileSchemaClientSide(z)).min(1);
};

export const getUploadManyFilesSchemaClientSide = (z: InterZod) => {
	return z.object({
		files: getFilesArraySchemaClientSide(z),
		parentFolderPath: getFolderNameSchema(z).optional(),
	});
};

export const getCreateFolderSchemaClientSide = (z: InterZod) => {
	return z.object({
		folderName: getFolderNameSchema(z),
		parentFolderPath: getFolderNameSchema(z).optional(),
		files: getFilesArraySchemaClientSide(z).optional(),
	});
};

export type UploadManyFilesInputClientSide = zod.infer<
	ReturnType<typeof getUploadManyFilesSchemaClientSide>
>;
export type CreateFolderInputClientSide = zod.infer<
	ReturnType<typeof getCreateFolderSchemaClientSide>
>;
