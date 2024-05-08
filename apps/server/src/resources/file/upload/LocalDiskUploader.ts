import path from 'path';

import sharp from 'sharp';

import { FILE_UPLOAD_DESTINATION } from '@/server/lib/constants';
import { env } from '@/server/lib/env';
import { fileProvider } from '@/shared/lib/constants';

import type Uploader from './Uploader.interface';
import type { UploadInput } from './Uploader.interface';

export default class LocalDiskUploader implements Uploader {
	provider = fileProvider.LOCAL_DISK;

	// eslint-disable-next-line class-methods-use-this
	async upload(params: UploadInput) {
		await sharp(params.buffer).toFile(path.join(FILE_UPLOAD_DESTINATION, params.name));

		return {
			// TODO: remove express mount path when saving
			// form the correct path in the server and not on the client when getting an AppFile
			url: path.posix.join(env.EXPRESS_FILES_MOUNT_PATH, params.name),
		};
	}
}
