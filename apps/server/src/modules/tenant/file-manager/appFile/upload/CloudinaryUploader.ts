import { type UploadApiResponse } from 'cloudinary';
import streamifier from 'streamifier';

import cloudinary from '@/server/lib/cloudinary';
import { fileProvider } from '@/shared/lib/constants';

import { type Uploader, type UploadInput } from './Uploader.interface';

export default class CloudinaryUploader implements Uploader {
	provider = fileProvider.CLOUDINARY;

	// eslint-disable-next-line class-methods-use-this
	async upload(params: UploadInput) {
		// eslint-disable-next-line no-new
		const uploadPromise = new Promise<UploadApiResponse | undefined>((resolve, reject) => {
			const cloudinaryUploadStream = cloudinary.uploader.upload_stream(
				{ folder: global.MODE === 'production' ? 'devist-files' : 'devist-dev-files', filename_override: params.name },
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
		});

		const result = await uploadPromise;

		if (!result) {
			throw new Error('Bad upload: result is empty');
		}

		return {
			url: result.url,
		};
	}
}
