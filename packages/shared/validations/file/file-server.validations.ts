import type { Readable } from 'node:stream';

import type zod from 'zod';

import type InterZod from '@/shared/lib/zod/InterZod';

import { getFolderNameSchema } from './file.validations';

export const getMulterFileSchema = (
	z: InterZod,
): zod.ZodType<Express.Multer.File> => {
	return z.object({
		fieldname: z.string(),
		originalname: z.string(),
		encoding: z.string(),
		mimetype: z.string(),
		size: z.number(),
		stream: z.custom<Readable>(),
		destination: z.string(),
		filename: z.string(),
		path: z.string(),
		buffer: z.custom<Buffer>(),
	});
};

export const getMulterFilesArraySchema = (z: InterZod) => {
	return z.array(getMulterFileSchema(z)).min(1);
};

export const getMulterUploadManyFilesSchema = (z: InterZod) => {
	return z.object({
		files: getMulterFilesArraySchema(z),
		parentFolderPath: getFolderNameSchema(z).optional(),
	});
};

export type MulterUploadManyFilesInput = zod.infer<
	ReturnType<typeof getMulterUploadManyFilesSchema>
>;

export const getMulterCreateFolderSchema = (z: InterZod) => {
	return z.object({
		folderName: getFolderNameSchema(z),
		parentFolderPath: getFolderNameSchema(z).optional(),
		files: getMulterFilesArraySchema(z).optional(),
	});
};

export type MulterCreateFolderInput = zod.infer<
	ReturnType<typeof getMulterCreateFolderSchema>
>;
