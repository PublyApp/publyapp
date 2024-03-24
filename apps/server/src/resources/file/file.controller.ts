import type { RequestHandler } from 'express';

import { getMulterFilesArraySchema } from '@devist/shared/validations/file/file.validations.server';

import { HttpException } from '@/server/exceptions/HttpException';
import FileService from '@/server/resources/file/file.service';
import { getRequestUtils } from '@/server/utils/request.utils';
import type { AppFile } from '@/shared/types/db/appFile.types';

import FolderService from '../folder/folder.service';

// import { AuthCloudService } from '../cloud/services/auth.cloud.service';

export const handleUploadSingleFile: RequestHandler = async (req, res, next) => {
	try {
		if (!req.file) {
			throw new HttpException(400, 'file to upload missing');
		}

		const { provider, parentFolderPath } = req.body;

		// const sessionToken = req.get(PARSE_SESSION_TOKEN_HEADER_KEY);
		const sessionToken = req.user?.getSessionToken();

		const uploadAdapter = FileService.uploadAdapterMap.get(provider) || FileService.defaultUploadAdapter;

		const folderService = new FolderService({ sessionToken });
		const fileService = new FileService({ sessionToken, uploadAdapter });

		const parentFolder = await folderService.getByPath(parentFolderPath);

		const savedParseFile = await fileService.createOne({
			file: req.file,
			parentFolder,
		});

		const appFile = savedParseFile.toJSON(); // TODO: inspect the final value

		res.status(201).send(appFile);
	} catch (error) {
		next(error);
	}
};

export const handleUploadManyFiles: RequestHandler = async (req, res, next) => {
	try {
		const { z } = getRequestUtils(req);
		const files = getMulterFilesArraySchema(z).parse(req.files);

		const { parentFolderPath, provider } = req.body;

		// const sessionToken = req.get(PARSE_SESSION_TOKEN_HEADER_KEY);
		const sessionToken = req.user?.getSessionToken();

		const uploadAdapter = FileService.uploadAdapterMap.get(provider) || FileService.defaultUploadAdapter;

		const folderService = new FolderService({ sessionToken });
		const fileService = new FileService({ sessionToken, uploadAdapter });

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
