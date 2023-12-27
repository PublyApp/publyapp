import type { RequestHandler } from 'express';

import { multerFilesArraySchema } from '@devist/shared/validations/file/file.validations.server';

import { HttpException } from '@/server/exceptions/HttpException';
import FileService from '@/server/services/file.service';
import { PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';
import type { AppFile } from '@/shared/types/appFile.types';

import FolderService from '../services/folder.service';

// import { AuthCloudService } from '../cloud/services/auth.cloud.service';

export const handleUploadSingleFile: RequestHandler = async (req, res, next) => {
	try {
		if (!req.file) {
			throw new HttpException(400, 'file to upload missing');
		}

		const sessionToken = req.get(PARSE_SESSION_TOKEN_HEADER_KEY);
		// const authService = AuthCloudService.createAuthCloudService();

		const fileService = new FileService({ file: req.file, sessionToken });
		const savedParseFile = await fileService.saveOne();

		res.status(201).send(savedParseFile.toJSON());
	} catch (error) {
		next(error);
	}
};

export const handleUploadManyFiles: RequestHandler = async (req, res, next) => {
	try {
		const files = multerFilesArraySchema.parse(req.files);

		const sessionToken = req.get(PARSE_SESSION_TOKEN_HEADER_KEY);
		// const authService = AuthCloudService.createAuthCloudService();

		const { parentFolderPath } = req.body;

		const folderService = new FolderService({ path: parentFolderPath, sessionToken });
		const parentFolder = await folderService.getByPath();

		const fileService = new FileService({ files, sessionToken, parentFolder });
		const savedParseFiles = await fileService.saveMany();

		const savedFiles: AppFile[] = savedParseFiles.map((file) => {
			return file.toJSON() as unknown as AppFile;
		});

		res.status(201).send(savedFiles);
	} catch (error) {
		next(error);
	}
};
