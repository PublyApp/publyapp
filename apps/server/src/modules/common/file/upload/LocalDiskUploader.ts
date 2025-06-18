import path from 'node:path';
import { FILE_UPLOAD_DESTINATION } from '@/server/lib/constants';
import { logger } from '@/server/lib/winston';
import { fileProvider } from '@/shared/lib/constants';
import sharp from 'sharp';
import type { UploadInput, Uploader } from './Uploader.interface';

export default class LocalDiskUploader implements Uploader {
	provider = fileProvider.LOCAL_DISK;

	async upload(params: UploadInput) {
		if (params.storageFrom === 'disk') {
			// throw new Error('Cannot upload to cloud from disk: not implemented yet');
			// ** we assume multer has already put the file in the correct place
			// ** on our local disk
			logger.debug('Uploading to local disk');

			return {
				// ! remember to:
				// form the correct path in the server and not on the client when getting an AppFile
				// I intentionally removed express mount pth from there
				// ? To avoid confusion, It is better to use external services like cloudinary instead of using local disk
				url: path.posix.join('/', params.file.originalname),
			};
		}

		await sharp(params.file.buffer).toFile(
			path.join(FILE_UPLOAD_DESTINATION, params.file.originalname),
		);

		return {
			// ! remember to:
			// form the correct path in the server and not on the client when getting an AppFile
			// I intentionally removed express mount pth from there
			// ? To avoid confusion, It is better to use external services like cloudinary instead of using local disk
			url: path.posix.join('/', params.file.originalname),
		};
	}
}
