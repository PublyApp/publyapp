import { fileProvider } from '@/shared/lib/constants';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import type { Uploader, UploadInput } from './Uploader.interface';
import path from 'node:path';
import { appendHashToFilename } from '@/server/utils/any.utils';
import { env } from '@/server/lib/env';

const CLOUDFLARE_ACCOUNT_ID = '0cbb7862c10ee3b215e7c9e2745695b6';
const CLOUDFLARE_ACCESS_KEY_ID = '923014d9d938f0c8728bf6ac54aecb31';
const CLOUDFLARE_SECRET_ACCESS_KEY =
	'cec91e954947c268218270db7dee60128a33752e2740044ba3fa187769626d24';

const CLOUDFLARE_BUCKET_NAME = 'pdf-vite-static-assets';

const r2 = new S3Client({
	region: 'auto', // ✅ required even though it's not used
	endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: CLOUDFLARE_ACCESS_KEY_ID,
		secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY,
	},
	forcePathStyle: true, // ✅ important
});

export default class CloudFlareUploader
	implements Uploader<Record<string, unknown>>
{
	provider = fileProvider.CLOUDFLARE;

	async upload(params: UploadInput) {
		if (params.storageFrom === 'disk') {
			throw new Error('Cannot upload to cloud from disk: not implemented yet');
		}

		let key = path.posix.join(
			env.MODE !== 'production' ? '__dev__' : '',
			'uploads',
			params.folderPath || '',
			params.file.originalname,
		);
		key = appendHashToFilename(key);

		const command = new PutObjectCommand({
			Bucket: CLOUDFLARE_BUCKET_NAME,
			Key: key,
			Body: params.file.buffer,
			ContentType: params.file.mimetype,
		});

		const command_output = await r2.send(command);

		const urlFile = new URL('https://static.pdfvite.com');
		urlFile.pathname = key;
		return {
			url: urlFile.toString(),
			provider: this.provider,
			meta: {
				command_output,
			},
		};
	}
}
