import path from 'path';

import sizeOf from 'image-size';
import _ from 'lodash';
import sharp from 'sharp';

import { IMAGE_FORMAT_CONFIG } from '@devist/shared/lib/constants';
import { ParseAppFile } from '@devist/shared/lib/parse/classes/appFile.class';
import type { ListMeta } from '@devist/shared/types/any.types';

import { USE_MASTER_KEY } from '@server/lib/constants';
import { env } from '@server/lib/env';
import { applySkipAndLimit } from '@server/lib/parse';
import { addSuffixToFileName } from '@server/utils/any.utils';
import type { AppFile, ImageFormatData, ImageFormatType } from '@shared/types/appFile.types';

export type FileServiceProps = {
	file?: Express.Multer.File;
	folder?: ParseAppFile | Parse.Object;
	alternativeText?: string;
	caption?: string;
};

// type ListFilesOptions = { page: number; pageSize: number; json?: boolean };

export default class FileService {
	file?: Express.Multer.File;

	folder?: ParseAppFile | Parse.Object;

	formats?: Record<ImageFormatType, ImageFormatData>;

	alternativeText?: string;

	caption?: string;

	constructor({ file, alternativeText, caption, folder }: FileServiceProps) {
		this.file = file;
		this.folder = folder;
		this.alternativeText = alternativeText;
		this.caption = caption;
	}

	isImage() {
		return this.file?.mimetype.startsWith('image/');
	}

	getFolderPath(): string {
		return (this.folder as ParseAppFile | undefined)?.get('path') ?? '/';
	}

	private async generateImageFormats() {
		if (!this.file) {
			throw new Error('[FileService.generateImageFormats]: file member is missing');
		}

		if (!this.isImage()) {
			throw new Error("[FileService.generateImageFormats]: File must be of type 'image/*'");
		}

		const { originalname, path: filePath, destination } = this.file;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const uid = _.get(this.file as any, 'uid') as string;

		const formats = {} as unknown as NonNullable<typeof this.formats>;

		const promise = Promise.all(
			Object.entries(IMAGE_FORMAT_CONFIG).map(async ([format, config]) => {
				const formatFileName = addSuffixToFileName(originalname, `${uid}_@${format}`);

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

		await promise
			.then(() => {
				this.formats = formats;
			})
			.catch((reason) => {
				this.formats = undefined;
				throw reason;
			});
	}

	private async saveRecord() {
		if (!this.file) {
			throw new Error('[FileService.saveRecord]: file member is missing');
		}

		const { mimetype, filename, path: filePath, size } = this.file;

		const parseFile = new ParseAppFile({
			provider: 'local',
			url: `${env.EXPRESS_FILES_MOUNT_PATH}/${filename}`,
			mimeType: mimetype,
			name: filename,
			path: this.getFolderPath() + filename,
			folder: this.folder,
			size,
		});

		if (this.isImage() && !_.isEmpty(this.formats)) {
			const { height, width } = sizeOf(filePath);

			parseFile.set('formats', this.formats);
			parseFile.set('height', height);
			parseFile.set('width', width);
		}

		// logger.info(parseFile.toJSON());
		return parseFile.save(null, USE_MASTER_KEY);
	}

	async save() {
		if (this.isImage()) {
			// create different files formats
			// saves these formats into the fs
			await this.generateImageFormats();
		} else {
			//
		}

		// save file's datas into the database
		return this.saveRecord();
	}

	async listFiles(options: {
		page: number;
		pageSize: number;
		json?: true;
	}): Promise<{ appFiles: AppFile[] } & ListMeta>;
	async listFiles(options: {
		page: number;
		pageSize: number;
		json: false;
	}): Promise<{ appFiles: ParseAppFile[] } & ListMeta>;
	async listFiles(options: { page: number; pageSize: number; json?: boolean }) {
		const folderPath = this.getFolderPath();
		const totalCountQuery = new Parse.Query(ParseAppFile);

		const clojure1 = async (page: number, pageSize: number, json?: boolean) => {
			const query = new Parse.Query(ParseAppFile).doesNotExist('folder');
			applySkipAndLimit(query, { type: 'page', page, pageSize });
			const [appFiles, totalCount] = await Promise.all([
				query.find({ ...USE_MASTER_KEY, json }),
				totalCountQuery.count(USE_MASTER_KEY),
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

		const clojure2 = async (page: number, pageSize: number, json?: boolean) => {
			const folderQuery = new Parse.Query(ParseAppFile).equalTo('path', folderPath);
			const query = new Parse.Query(ParseAppFile).matchesQuery('folder', folderQuery);
			applySkipAndLimit(query, { type: 'page', page, pageSize });
			const [appFiles, totalCount] = await Promise.all([
				query.find({ ...USE_MASTER_KEY, json }),
				totalCountQuery.count(USE_MASTER_KEY),
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

			if (folderPath === '/') {
				return (await clojure1(page, pageSize, json)) as unknown as {
					appFiles: AppFile[];
				} & ListMeta;
			}

			return (await clojure2(page, pageSize, json)) as unknown as {
				appFiles: AppFile[];
			} & ListMeta;
		}

		const { page, pageSize, json } = options;

		if (folderPath === '/') {
			return (await clojure1(page, pageSize, json)) as unknown as { appFiles: ParseAppFile[] } & ListMeta;
		}

		return (await clojure2(page, pageSize, json)) as unknown as { appFiles: ParseAppFile[] } & ListMeta;
	}
}
