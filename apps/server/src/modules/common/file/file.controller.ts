import { getMulterFilesArraySchema } from '@org/shared/validations/file/file.validations.server';

import { HttpException } from '@/server/exceptions/HttpException';
import { expressHandler, getRequestUtils } from '@/server/lib/express';

import FileService from './file.service';

export const handleUploadSingleFile = expressHandler(async (req, res) => {
	if (!req.file) {
		throw new HttpException(400, 'file to upload missing');
	}

	const { provider, parentFolderPath } = req.body;

	const sessionToken = req.user?.getSessionToken();

	const uploadAdapter = FileService.uploadAdapterMap.get(provider) || FileService.defaultUploadAdapter;

	const fileService = new FileService({ sessionToken, uploadAdapter });

	const result = await fileService.uploadOne({
		file: req.file,
		folderPath: parentFolderPath,
	});

	res.status(201).send(result);
});

export const handleUploadManyFiles = expressHandler(async (req, res) => {
	const { z } = getRequestUtils(req);
	const files = getMulterFilesArraySchema(z).parse(req.files);

	const { parentFolderPath, provider } = req.body;

	const sessionToken = req.user?.getSessionToken();

	const uploadAdapter = FileService.uploadAdapterMap.get(provider) || FileService.defaultUploadAdapter;

	const fileService = new FileService({ sessionToken, uploadAdapter });

	const results = await fileService.uploadMany({
		files,
		folderPath: parentFolderPath,
	});

	res.status(201).send(results);
});
