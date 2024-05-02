import path from 'path';

import sharp from 'sharp';

import { FILE_UPLOAD_DESTINATION } from '@/server/lib/constants';
import { env } from '@/server/lib/env';
import { fileProvider } from '@/shared/lib/constants';

import type UploaderInterface from './UploaderInterface';
import type { UploadInput } from './UploaderInterface';

export default class LocalDiskUploader implements UploaderInterface {
	provider = fileProvider.LOCAL_DISK;

	// eslint-disable-next-line class-methods-use-this
	async upload(params: UploadInput) {
		await sharp(params.buffer).toFile(path.join(FILE_UPLOAD_DESTINATION, params.name));

		return {
			url: path.posix.join(env.EXPRESS_FILES_MOUNT_PATH, params.name),
		};
	}
}
