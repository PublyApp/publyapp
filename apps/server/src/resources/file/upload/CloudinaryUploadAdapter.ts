import { sleep } from '@devist/shared/utils/any.utils';

import { fileProvider } from '@/shared/lib/constants';

import type UploadAdapterInterface from './UploadAdapterInterface';
import type { UploadInput } from './UploadAdapterInterface';

export default class LocalDiskUploadAdapter implements UploadAdapterInterface {
	provider = fileProvider.CLOUDINARY;

	// eslint-disable-next-line class-methods-use-this
	async upload(_params: UploadInput) {
		await sleep(3000);

		return {
			url: 'fake-url-lol',
		};
	}
}
