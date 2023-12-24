import type { RequestHandler } from 'express';

import { HttpException } from '@/server/exceptions/HttpException';
import FileService from '@/server/services/file.service';

export const handleUploadSingleFile: RequestHandler = async (req, res, next) => {
	try {
		if (!req.file) {
			throw new HttpException(400, 'file to upload missing');
		}

		const fileService = new FileService({ file: req.file });
		const savedParseFile = await fileService.saveOne();

		res.status(201).send(savedParseFile.toJSON());
	} catch (error) {
		next(error);
	}
};

export const handleUploadManyFiles: RequestHandler = async (req, res, next) => {
	try {
		const { files } = req;

		// if (!files) {
		// 	throw new HttpException(400, 'file to upload missing');
		// }

		const fileService = new FileService({ files });
		const savedParseFiles = await fileService.saveMany();

		const savedFiles = savedParseFiles.map((file) => {
			return file.toJSON();
		});

		res.status(201).send(savedFiles);
	} catch (error) {
		next(error);
	}
};
