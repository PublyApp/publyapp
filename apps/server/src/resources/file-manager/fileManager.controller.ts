import { getMulterFilesArraySchema } from '@devist/shared/validations/file/file.validations.server';

import { HttpException } from '@/server/exceptions/HttpException';
import { expressHandler } from '@/server/lib/express';
import AppFileService from '@/server/resources/file-manager/appFile/appFile.service';
import { getRequestUtils } from '@/server/utils/request.utils';
import type { AppFile } from '@/shared/types/db/appFile.types';

import AppFileFolderService from './appFileFolder/appFileFolder.service';

export const handleUploadSingleFile = expressHandler(async (req, res) => {
	if (!req.file) {
		throw new HttpException(400, 'file to upload missing');
	}

	const { provider, parentFolderPath } = req.body;

	// const sessionToken = getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY);
	const sessionToken = req.user?.getSessionToken();

	const uploadAdapter = AppFileService.uploadAdapterMap.get(provider) || AppFileService.defaultUploadAdapter;

	const folderService = new AppFileFolderService({ sessionToken });
	const fileService = new AppFileService({ sessionToken, uploadAdapter });

	const parentFolder = await folderService.getByPath(parentFolderPath);

	const savedParseFile = await fileService.createOne({
		file: req.file,
		parentFolder,
	});

	const appFile = savedParseFile.toJSON(); // TODO: inspect the final value

	res.status(201).send(appFile);
});

export const handleUploadManyFiles = expressHandler(async (req, res) => {
	const { z } = getRequestUtils(req);
	const files = getMulterFilesArraySchema(z).parse(req.files);

	const { parentFolderPath, provider } = req.body;

	// const sessionToken = getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY);
	const sessionToken = req.user?.getSessionToken();

	const uploadAdapter = AppFileService.uploadAdapterMap.get(provider) || AppFileService.defaultUploadAdapter;

	const folderService = new AppFileFolderService({ sessionToken });
	const fileService = new AppFileService({ sessionToken, uploadAdapter });

	const parentFolder = await folderService.getByPath(parentFolderPath);

	const savedParseFiles = await fileService.createMany({
		files,
		parentFolder,
	});

	const savedFiles: AppFile[] = savedParseFiles.map((file) => {
		return file.toJSON() as unknown as AppFile;
	});

	res.status(201).send(savedFiles);
});
