// import { UploadUserImageDto } from "@/dtos/files.dto";
// import { UploadedFile } from "@/interfaces/files.interface";
// import FileService from "@/services/files.service";
// import { logger } from "@/utils/logger";
import { logger } from 'parse-server';

import type { NextFunction, Request, Response } from 'express';

import FileService, { type UploadedFile } from '@server/services/files.service';

class FileController {
	// public fileService = new FileService();

	// upload single file
	static uploadFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { file }: any = req;
			const { folder, userId } /* : UploadUserImageDto */ = req.body;

			if (!userId) {
				throw Error('Missing user id parameter');
			}

			if (!file) {
				throw Error('Missing file');
			}

			if (!folder) {
				throw Error('Missing folder parameter');
			}

			const { publicId, url }: UploadedFile = await FileService.uploadFile(file, folder);

			res.status(201).json({ publicId, url });
		} catch (error) {
			logger.error(`[src/controllers/files.controllers.ts:FilesController.uploadFile] error:\n${error /* .message */}`);

			next(error);
		}
	};

	// upload multiple files
	static uploadFiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { files }: any = req;
			const { folder, userId } /* : UploadUserImageDto */ = req.body;

			if (!userId) {
				throw Error('Missing user id parameter');
			}

			if (!files) {
				throw Error('Missing files');
			}

			if (!folder) {
				throw Error('Missing folder parameter');
			}

			const responses = files.map((file: any) => {
				return FileService.uploadFile(file, folder);
			});

			const uploadedFiles = await Promise.all(responses);

			res.status(201).json({ uploadedFiles });
		} catch (error) {
			logger.error(
				`[src/controllers/files.controllers.ts:FilesController.uploadFiles] error:\n${error /* .message */}`,
			);

			next(error);
		}
	};
}

export default FileController;
