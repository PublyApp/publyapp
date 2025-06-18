import type { UploadApiResponse } from 'cloudinary';
import { APP_ID, fileProvider } from '@/shared/lib/constants';

import type { Uploader, UploadInput } from './Uploader.interface';
import _ from 'lodash';
import cloudinary from '@/server/lib/cloudinary';
import { makePath } from '@/shared/utils/string.utils';
import { env } from '@/server/lib/env';
import { newObjectId } from 'parse-server/lib/cryptoUtils.js';
import { Readable } from 'node:stream';

export default class CloudinaryUploader implements Uploader<UploadApiResponse> {
	provider = fileProvider.CLOUDINARY;

	async upload(params: UploadInput) {
		if (params.storageFrom === 'disk') {
			throw new Error('Cannot upload to cloud from disk: not implemented yet');
		}

		// const cloudinary = await initCloudinary();
		const uploadPromise = new Promise<UploadApiResponse | undefined>(
			(resolve, reject) => {
				const cloudinaryUploadStream = cloudinary.uploader.upload_stream(
					{
						folder:
							env.MODE === 'production'
								? makePath(`${APP_ID}-prod-files`, params.folderPath || '')
								: makePath(`${APP_ID}-dev-files`, params.folderPath || ''),
						filename_override: `${params.file.originalname}_${newObjectId()}`,
					},
					(error, result) => {
						if (error) {
							if (
								!_.isError(error) &&
								_.isObject(error) &&
								_.has(error, 'message')
							) {
								return reject(new Error(_.get(error, 'message')));
							}
							return reject(error);
						}

						return resolve(result);
					},
				);

				Readable.from(params.file.buffer).pipe(cloudinaryUploadStream);
			},
		);

		const result = await uploadPromise;

		if (!result) {
			throw new Error('Bad upload: result is empty');
		}

		return {
			url: result.url,
			provider: this.provider,
			meta: result,
		};
	}
}
