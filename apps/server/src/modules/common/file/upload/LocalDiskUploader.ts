import path from 'node:path';

import sharp from 'sharp';

import { FILE_UPLOAD_DESTINATION } from '@/server/lib/constants';
import { fileProvider } from '@/shared/lib/constants';

import type { Uploader, UploadInput } from './Uploader.interface';

export default class LocalDiskUploader implements Uploader {
	provider = fileProvider.LOCAL_DISK;

	// eslint-disable-next-line class-methods-use-this
	async upload(params: UploadInput) {
		await sharp(params.buffer).toFile(
			path.join(FILE_UPLOAD_DESTINATION, params.name),
		);

		return {
			// ! remember to:
			// form the correct path in the server and not on the client when getting an AppFile
			// I intentionally removed express mount pth from there
			// ? To avoid confusion, It is better to use external services like cloudinary instead of using local disk
			url: path.posix.join('/', params.name),
		};
	}
}
