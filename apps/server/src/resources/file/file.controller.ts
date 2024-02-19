import type { RequestHandler } from 'express';

import { multerFilesArraySchema } from '@devist/shared/validations/file/file.validations.server';

import { HttpException } from '@/server/exceptions/HttpException';
import FileService from '@/server/resources/file/file.service';
import { PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';
import type { AppFile } from '@/shared/types/db/appFile.types';

import FolderService from '../folder/folder.service';

// import { AuthCloudService } from '../cloud/services/auth.cloud.service';

export const handleUploadSingleFile: RequestHandler = async (req, res, next) => {
	try {
		if (!req.file) {
			throw new HttpException(400, 'file to upload missing');
		}

		const sessionToken = req.get(PARSE_SESSION_TOKEN_HEADER_KEY);
		// const authService = await AuthCloudService.createAuthCloudService();

		const fileService = new FileService({ sessionToken });
		const savedParseFile = await fileService.createOne({
			file: req.file,
			// parentFolder,
		});

		res.status(201).send(savedParseFile.toJSON());
	} catch (error) {
		next(error);
	}
};

export const handleUploadManyFiles: RequestHandler = async (req, res, next) => {
	try {
		const files = multerFilesArraySchema.parse(req.files);
		const { parentFolderPath } = req.body;

		const sessionToken = req.get(PARSE_SESSION_TOKEN_HEADER_KEY);

		const folderService = new FolderService({ sessionToken });
		const fileService = new FileService({ sessionToken });
		// const authService = await AuthCloudService.createAuthCloudService();

		const parentFolder = await folderService.getByPath(parentFolderPath);

		const savedParseFiles = await fileService.createMany({
			files,
			parentFolder,
		});

		const savedFiles: AppFile[] = savedParseFiles.map((file) => {
			return file.toJSON() as unknown as AppFile;
		});

		res.status(201).send(savedFiles);
	} catch (error) {
		next(error);
	}
};
