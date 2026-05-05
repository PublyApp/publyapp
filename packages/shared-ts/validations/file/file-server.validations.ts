import type { Readable } from 'node:stream';

import type zod from 'zod';

import type InterZod from '@org/shared-ts/lib/zod/InterZod';

import { getFolderNameSchema } from './file.validations';

export type MulterMemoryFile = Pick<
	Express.Multer.File,
	'fieldname' | 'originalname' | 'encoding' | 'mimetype' | 'buffer' | 'size'
>;
export type MulterDiskFile = Pick<
	Express.Multer.File,
	'fieldname' | 'originalname' | 'encoding' | 'mimetype' | 'buffer' | 'size'
>;

export const getMulterMemoryFileSchema = (
	z: InterZod,
): zod.ZodType<MulterMemoryFile> => {
	return z.object({
		fieldname: z.string(),
		originalname: z.string(),
		encoding: z.string(),
		mimetype: z.string(),
		buffer: z.custom<Buffer>(),
		size: z.number(),
		// ====
		stream: z.custom<Readable>().optional(),
		destination: z.string().optional(),
		filename: z.string().optional(),
		path: z.string().optional(),
	});
	//  as zod.ZodType<Express.Multer.File>;
};

export const getMulterMemoryFilesArraySchema = (z: InterZod) => {
	return z.array(getMulterMemoryFileSchema(z)).min(1);
};

export const getMulterUploadManyFilesSchema = (z: InterZod) => {
	return z.object({
		files: getMulterMemoryFilesArraySchema(z),
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
		files: getMulterMemoryFilesArraySchema(z).optional(),
	});
};

export type MulterCreateFolderInput = zod.infer<
	ReturnType<typeof getMulterCreateFolderSchema>
>;
