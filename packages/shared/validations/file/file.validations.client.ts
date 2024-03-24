import type zod from 'zod';

import type CustomZod from '@/shared/lib/zod/CustomZod';

import { getFolderNameSchema } from './file.validations';

export const getFileSchemaClientSide = (z: CustomZod) => {
	const field = z.t('common:field');
	const type = z.t('common:file');

	return z.custom<
		File & {
			preview?: string;
			// alreadyUploaded?: boolean
			appFileId?: string;
		}
	>(
		(data) => {
			return data instanceof File;
		},
		{
			message: z.t('notInstanceOf', { field, type }),
		},
	);
};

export const getFilesArraySchemaClientSide = (z: CustomZod) => {
	return z.array(getFileSchemaClientSide(z)).min(1);
};

export const getUploadManyFilesSchemaClientSide = (z: CustomZod) => {
	return z.object({
		files: getFilesArraySchemaClientSide(z),
		parentFolderPath: getFolderNameSchema(z).optional(),
	});
};

export const getCreateFolderSchemaClientSide = (z: CustomZod) => {
	return z.object({
		folderName: getFolderNameSchema(z),
		parentFolderPath: getFolderNameSchema(z).optional(),
		files: getFilesArraySchemaClientSide(z).optional(),
	});
};

export type UploadManyFilesInputClientSide = zod.infer<ReturnType<typeof getUploadManyFilesSchemaClientSide>>;
export type CreateFolderInputClientSide = zod.infer<ReturnType<typeof getCreateFolderSchemaClientSide>>;
