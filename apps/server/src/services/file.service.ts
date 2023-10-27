import path from 'path';

import _ from 'lodash';
import sharp from 'sharp';

import { ParseAppFile } from '@devist/shared/parse/classes/appFile.class';

import { addSuffixToFileName } from '@server/utils/any.utils';
import { IMAGE_FORMAT_CONFIG } from '@server/utils/constants';
import type { ImageFormatType } from '@shared/types/appFile.types';

export default class FileService {
	file: Express.Multer.File;

	formats?: Record<ImageFormatType, any>;

	constructor(file: Express.Multer.File) {
		this.file = file;
	}

	async generateImageFormats() {
		if (this.file.mimetype.startsWith('image/')) {
			throw new Error("File must be of type 'image/*' to be able to call this method");
		}

		this.formats = {} as unknown as typeof this.formats;

		const promise = Promise.all(
			Object.entries(IMAGE_FORMAT_CONFIG).map(async ([format, config]) => {
				const uid = _.get(this.file as any, 'uid') as string;

				const fileInfo = await sharp(this.file.path)
					.resize(config.width, config.height, {
						fit: 'inside',
					})
					.toFile(path.join(this.file.destination, addSuffixToFileName(this.file.originalname, `${uid}_@${format}`)));

				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				Object.assign(this.formats!, { [format]: fileInfo });
			}),
		);

		await promise.catch((reason) => {
			this.formats = undefined;
			throw reason;
		});
	}

	async saveDBRecord() {
		// save all informations into an AppFile Parse object in the database
		const { destination, fieldname, mimetype, originalname, filename, path, size } = this.file;

		const appFile = new ParseAppFile({
			provider: 'local',
			url: `/app/files/${filename}`,
			size,
			mimeType: mimetype,
		});
	}
}
