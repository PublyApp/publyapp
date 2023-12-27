import path from 'path';

import async from 'async';
import sizeOf from 'image-size';
import _ from 'lodash';
import sharp from 'sharp';

import { fileProvider, IMAGE_FORMAT_CONFIG } from '@devist/shared/lib/constants';
import { ParseAppFile } from '@devist/shared/lib/parse/classes/appFile.class';
import type { ListMeta } from '@devist/shared/types/any.types';

import { env } from '@/server/lib/env';
import { applySkipAndLimit } from '@/server/lib/parse';
import { addSuffixToFileName } from '@/server/utils/any.utils';
import type { AppFile, ImageFormatData, ImageFormatType } from '@/shared/types/appFile.types';

export type FileServiceProps = {
	file?: Express.Multer.File;
	files?: Express.Multer.File[];
	parentFolder?: ParseAppFile | Parse.Object;
	alternativeText?: string;
	caption?: string;
	sessionToken?: string;
};

// type ListFilesOptions = { page: number; pageSize: number; json?: boolean };

export default class FileService {
	file?: Express.Multer.File;

	files?: Express.Multer.File[];

	parentFolder?: ParseAppFile | Parse.Object;

	formats?: Record<ImageFormatType, ImageFormatData>[];

	alternativeText?: string;

	caption?: string;

	sessionToken?: string;

	constructor({ file, files, alternativeText, caption, parentFolder, sessionToken }: FileServiceProps) {
		this.file = file;
		this.files = files;
		this.parentFolder = parentFolder;
		this.alternativeText = alternativeText;
		this.caption = caption;
		this.sessionToken = sessionToken;
	}

	static isImage(file: Express.Multer.File) {
		return file.mimetype.startsWith('image/');
	}

	getParentFolderPath(): string {
		return (this.parentFolder as ParseAppFile | undefined)?.get('path') ?? '/';
	}

	private async generateImageFormats(file: Express.Multer.File) {
		// if (!file) {
		// 	throw new Error('[FileService.generateImageFormats]: file member is missing');
		// }

		if (!FileService.isImage(file)) {
			throw new Error("[FileService.generateImageFormats]: File must be of type 'image/*'");
		}

		const { originalname, path: filePath, destination } = file;
		const uid: string = _.get(file, 'uid')!;

		const formats = {} as unknown as NonNullable<typeof this.formats>[number];

		const getFormatsPromise = Promise.all(
			Object.entries(IMAGE_FORMAT_CONFIG).map(async ([format, config]) => {
				const formatFileName = addSuffixToFileName(originalname, `_${uid}_@${format}`);

				const sharpFileInfo = await sharp(filePath)
					.resize(config.width, config.height, {
						fit: 'inside',
					})
					.toFile(path.join(destination, formatFileName));

				const imageFormatData: ImageFormatData = {
					name: formatFileName,
					size: sharpFileInfo.size,
					url: `${env.EXPRESS_FILES_MOUNT_PATH}/${formatFileName}`,
					height: sharpFileInfo.height,
					width: sharpFileInfo.width,
				};

				Object.assign(formats, { [format]: imageFormatData });
			}),
		);

		await getFormatsPromise;
		// .catch((reason) => {
		// 	formats = undefined;
		// });

		return formats;

		// await promise
		// 	.then(() => {
		// 		this.formats = formats;
		// 	})
		// 	.catch((reason) => {
		// 		this.formats = undefined;
		// 		throw reason;
		// 	});
	}

	private async saveRecord(file: Express.Multer.File, formats?: NonNullable<typeof this.formats>[number]) {
		// if (!this.file) {
		// 	throw new Error('[FileService.saveRecord]: file member is missing');
		// }

		const { mimetype, filename, path: filePath, size } = file;

		const parseFile = new ParseAppFile({
			provider: fileProvider.LOCAL,
			url: `${env.EXPRESS_FILES_MOUNT_PATH}/${filename}`,
			mimeType: mimetype,
			name: filename,
			path: this.getParentFolderPath() + filename,
			folder: this.parentFolder,
			size,
		});

		// getFormatsForFile

		if (FileService.isImage(file) && !_.isEmpty(formats)) {
			const { height, width } = sizeOf(filePath);

			parseFile.set('formats', formats);
			parseFile.set('height', height);
			parseFile.set('width', width);
		}

		// logger.info(parseFile.toJSON());
		return parseFile.save(null, { sessionToken: this.sessionToken });
	}

	private async _saveOne(file: Express.Multer.File) {
		// if (!this.file) {
		// 	throw new Error('[FileService.saveOne]: file member is missing');
		// }
		let formats: NonNullable<typeof this.formats>[number] | undefined;

		if (FileService.isImage(file)) {
			// create different files formats
			// saves these formats into the fs
			formats = await this.generateImageFormats(file);
		} else {
			//
		}

		// save file's datas into the database
		return this.saveRecord(file, formats);
	}

	async saveOne() {
		if (!this.file) {
			throw new Error('[FileService.saveOne]: file member is missing');
		}

		const appFile = await this._saveOne(this.file);

		return appFile;

		// if (FileService.isImage(this.file)) {
		// 	// create different files formats
		// 	// saves these formats into the fs
		// 	await this.generateImageFormats();
		// } else {
		// 	//
		// }

		// // save file's datas into the database
		// return this.saveRecord();
	}

	async saveMany() {
		if (!this.files) {
			throw new Error('[FileService.saveMany]: files member is missing');
		}

		const parseFiles = await async.map(this.files, async (file: Express.Multer.File) => {
			const savedFile = await this._saveOne(file);
			return savedFile;
		});

		return parseFiles;
	}

	async listFiles(options: {
		page: number;
		pageSize: number;
		// sessionToken?: string;
		json?: true;
	}): Promise<{ appFiles: AppFile[] } & ListMeta>;
	async listFiles(options: {
		page: number;
		pageSize: number;
		// sessionToken?: string;
		json: false;
	}): Promise<{ appFiles: ParseAppFile[] } & ListMeta>;
	async listFiles(options: { page: number; pageSize: number; json?: boolean /* sessionToken?: string */ }) {
		// const { sessionToken } = options;
		const { sessionToken } = this;

		const parentFolderPath = this.getParentFolderPath();
		const totalCountQuery = new Parse.Query(ParseAppFile);

		const listRootFolderFiles = async (page: number, pageSize: number, json?: boolean) => {
			const query = new Parse.Query(ParseAppFile).doesNotExist('folder');

			query.descending('updatedAt');
			applySkipAndLimit(query, { type: 'page', page, pageSize });

			const [appFiles, totalCount] = await Promise.all([
				query.find({ sessionToken, json }),
				totalCountQuery.count({ sessionToken }),
			]);

			const count = appFiles.length;
			const lastPage = Math.ceil(totalCount / count);

			return {
				appFiles,
				meta: {
					count,
					totalCount,
					page,
					lastPage,
				},
			};
		};

		const listAnyOtherFolderFiles = async (page: number, pageSize: number, json?: boolean) => {
			const folderQuery = new Parse.Query(ParseAppFile).equalTo('path', parentFolderPath);
			const query = new Parse.Query(ParseAppFile).matchesQuery('folder', folderQuery);

			query.descending('updatedAt');
			applySkipAndLimit(query, { type: 'page', page, pageSize });

			const [appFiles, totalCount] = await Promise.all([
				query.find({ sessionToken, json }),
				totalCountQuery.count({ sessionToken }),
			]);

			const count = appFiles.length;
			const lastPage = Math.ceil(totalCount / count);

			return {
				appFiles,
				meta: {
					count,
					totalCount,
					page,
					lastPage,
				},
			};
		};

		if (options.json) {
			const { page, pageSize, json } = options;

			if (parentFolderPath === '/') {
				return (await listRootFolderFiles(page, pageSize, json)) as unknown as {
					appFiles: AppFile[];
				} & ListMeta;
			}

			return (await listAnyOtherFolderFiles(page, pageSize, json)) as unknown as {
				appFiles: AppFile[];
			} & ListMeta;
		}

		const { page, pageSize, json } = options;

		if (parentFolderPath === '/') {
			return (await listRootFolderFiles(page, pageSize, json)) as unknown as { appFiles: ParseAppFile[] } & ListMeta;
		}

		return (await listAnyOtherFolderFiles(page, pageSize, json)) as unknown as { appFiles: ParseAppFile[] } & ListMeta;
	}
}
