import type { Readable } from 'stream';

import { z } from 'zod';

import { folderNameSchema } from './file.validations';

export const multerFileSchema: z.ZodType<Express.Multer.File> = z.object({
	fieldname: z.string(),
	originalname: z.string(),
	encoding: z.string(),
	mimetype: z.string(),
	size: z.number(),
	stream: z.custom<Readable>(),
	// stream: z.custom<any>(), // cast to any just to avoid client-side compilation errors
	destination: z.string(),
	filename: z.string(),
	path: z.string(),
	buffer: z.custom<Buffer>(),
});

// export function getFileSchema(environment: 'browser'): z.ZodType<File, z.ZodTypeDef, File>;
// export function getFileSchema(environment: 'node'): z.ZodType<Express.Multer.File, z.ZodTypeDef, Express.Multer.File>;

// // eslint-disable-next-line func-style, prefer-arrow/prefer-arrow-functions
// export function getFileSchema(environment: 'node' | 'browser') {
// 	if (environment === 'browser') {
// 		return clientFileSchema;
// 	}

// 	if (environment === 'node') {
// 		return multerFileSchema;
// 	}

// 	throw new Error('Invalid environment');
// }

// export const clientFilesArraySchema = z.array(getFileSchema('browser')).min(1);
export const multerFilesArraySchema = z.array(multerFileSchema).min(1);

// export const clientUploadManyFilesSchema = z.object({
// 	files: clientFilesArraySchema,
// 	parentFolderPath: folderNameSchema.optional(),
// });

export const multerUploadManyFilesSchema = z.object({
	files: multerFilesArraySchema,
	parentFolderPath: folderNameSchema.optional(),
});

// export type ClientUploadManyFilesInput = z.infer<typeof clientUploadManyFilesSchema>;
export type MulterUploadMAnyFilesInput = z.infer<typeof multerUploadManyFilesSchema>;

// export const clientCreateFolderSchema = z.object({
// 	folderName: folderNameSchema,
// 	parentFolderPath: folderNameSchema.optional(),
// 	files: clientFilesArraySchema.optional(),
// });

export const multerCreateFolderSchema = z.object({
	folderName: folderNameSchema,
	parentFolderPath: folderNameSchema.optional(),
	files: multerFilesArraySchema.optional(),
});

// export type ClientCreateFolderInput = z.infer<typeof clientCreateFolderSchema>;
export type MulterCreateFolderInput = z.infer<typeof multerCreateFolderSchema>;
