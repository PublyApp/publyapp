import { logger } from 'parse-server';

import type { RequestHandler } from 'express';

import { HttpException } from '@server/exceptions/HttpException';
import FileService from '@server/services/file.service';

export const handleUploadSingleFile: RequestHandler = async (req, res, next) => {
	try {
		if (!req.file) {
			throw new HttpException(400, 'file to upload missing');
		}

		// logger.info(req.file);
		const fileService = new FileService(req.file);

		if (req.file?.mimetype.startsWith('image/')) {
			// create different files formats
			// saves these formats into the fs
			await fileService.generateImageFormats();
			logger.info(fileService.formats);
			// console.log('####', fileService.formats);
		} else {
			//
		}

		fileService.saveDBRecord();

		// =
		res.status(201).send('ok');
	} catch (error) {
		next(error);
	}
};
