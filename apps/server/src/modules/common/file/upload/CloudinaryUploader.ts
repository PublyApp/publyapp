import { type UploadApiResponse } from 'cloudinary';
import streamifier from 'streamifier';

import cloudinary from '@/server/lib/cloudinary';
import { env } from '@/server/lib/env';
import { APP_ID, fileProvider } from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import { type Uploader, type UploadInput } from './Uploader.interface';

export default class CloudinaryUploader implements Uploader<UploadApiResponse> {
	provider = fileProvider.CLOUDINARY;

	async upload(params: UploadInput) {
		const uploadPromise = new Promise<UploadApiResponse | undefined>(
			(resolve, reject) => {
				const cloudinaryUploadStream = cloudinary.uploader.upload_stream(
					{
						folder:
							env.MODE === 'production'
								? makePath(`${APP_ID}-prod-files`, params.folderPath || '')
								: makePath(`${APP_ID}-dev-files`, params.folderPath || ''),
						filename_override: params.name,
					},
					(error, result) => {
						if (error) {
							return reject(error);
						}

						return resolve(result);
					},
				);

				const readableStream = streamifier.createReadStream(params.buffer);
				// const readableStream = Readable.from(params.buffer);
				readableStream.pipe(cloudinaryUploadStream);
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
