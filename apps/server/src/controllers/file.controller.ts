import type { RequestHandler } from 'express';

import { HttpException } from '@server/exceptions/HttpException';
import FileService from '@server/services/file.service';

export const handleUploadSingleFile: RequestHandler = async (req, res, next) => {
	try {
		if (!req.file) {
			throw new HttpException(400, 'file to upload missing');
		}

		const fileService = new FileService({ file: req.file });
		const savedParseFile = await fileService.save();

		res.status(201).send(savedParseFile.toJSON());
	} catch (error) {
		next(error);
	}
};
