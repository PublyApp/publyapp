import path from 'path';

import async from 'async';
import sizeOf from 'image-size';
import _ from 'lodash';
import sharp from 'sharp';

import { fileProvider, IMAGE_FORMAT_CONFIG } from '@devist/shared/lib/constants';
import { ParseAppFile } from '@devist/shared/lib/parse/classes/appFile.class';
import type { ListMeta } from '@devist/shared/types/db/any.types';
import type { AppFile, ImageFormatData, ImageFormatType } from '@devist/shared/types/db/appFile.types';

import { env } from '@/server/lib/env';
import { applySkipAndLimit } from '@/server/lib/parse';
import { addSuffixToFileName } from '@/server/utils/any.utils';

import FolderService from './folder.service';

export type FileServiceProps = {
	sessionToken: string | undefined;
};

type Formats = Record<ImageFormatType, ImageFormatData>;

// type ListFilesOptions = { page: number; pageSize: number; json?: boolean };

export default class FileService {
	sessionToken?: string;

	constructor({ sessionToken }: FileServiceProps) {
		this.sessionToken = sessionToken;
	}

	static isImage(file: Express.Multer.File) {
		return file.mimetype.startsWith('image/');
	}

	// static getPathForFolder(folder: ParseAppFile | undefined): string {
	// 	// FileService.checkMimeType(folder, ['folder']);

	// 	return folder?.get('path') ?? '/';
	// }

	private static async _generateImageFormats(file: Express.Multer.File) {
		if (!FileService.isImage(file)) {
			throw new Error("[FileService.generateImageFormats]: File must be of type 'image/*'");
		}

		const { originalname, path: filePath, destination } = file;
		const uid: string = _.get(file, 'uid')!;

		const formats = {} as unknown as Formats;

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

		return formats;
	}

	private async _createRecord({
		file,
		formats,
		parentFolder,
	}: {
		file: Express.Multer.File;
		formats?: Formats;
		parentFolder?: ParseAppFile;
	}) {
		const { mimetype, filename, path: filePath, size } = file;

		const parseFile = new ParseAppFile({
			provider: fileProvider.LOCAL,
			url: `${env.EXPRESS_FILES_MOUNT_PATH}/${filename}`,
			mimeType: mimetype,
			name: filename,
			path: FolderService.getPathForFolder(parentFolder) + filename,
			folder: parentFolder,
			size,
		});

		if (FileService.isImage(file) && !_.isEmpty(formats)) {
			const { height, width } = sizeOf(filePath);

			parseFile.set('formats', formats);
			parseFile.set('height', height);
			parseFile.set('width', width);
		}

		// logger.info(parseFile.toJSON());
		return parseFile.save(null, { sessionToken: this.sessionToken });
	}

	async createOne({ file, parentFolder }: { file: Express.Multer.File; parentFolder?: ParseAppFile }) {
		if (!FolderService.isFolder(parentFolder)) {
			throw new Error("[FileService.createOne]: folder mimeType must be 'folder'");
		}

		let formats: Formats | undefined;

		if (FileService.isImage(file)) {
			// create different files formats
			// saves these formats into the fs
			formats = await FileService._generateImageFormats(file);
		} else {
			//
		}

		// save file's datas into the database
		return this._createRecord({ file, formats, parentFolder });
	}

	// static checkMimeType(appFile: ParseAppFile | undefined, mimeTypes: string[], throws?: true | undefined): void;
	// static checkMimeType(appFile: ParseAppFile | undefined, mimeTypes: string[], throws: false): boolean;
	// // eslint-disable-next-line consistent-return
	// static checkMimeType(appFile: ParseAppFile | undefined, mimeTypes: string[], throws = true) {
	// 	const CONDITION = !_.isNil(appFile) && !mimeTypes.includes(appFile.get('mimeType'));

	// 	if (throws) {
	// 		if (CONDITION) {
	// 			throw new Error('[FileService.checkMimeType]: Invalid mimeType');
	// 		}
	// 	} else {
	// 		return CONDITION;
	// 	}
	// }

	async createMany({ files, parentFolder }: { files: Express.Multer.File[]; parentFolder?: ParseAppFile }) {
		if (!FolderService.isFolder(parentFolder)) {
			throw new Error("[FileService.createMany]: folder mimeType must be 'folder'");
		}

		const parseFiles = await async.map(files, async (file: Express.Multer.File) => {
			const savedFile = await this.createOne({ file, parentFolder });
			return savedFile;
		});

		return parseFiles;
	}

	async listFiles(options: {
		page: number;
		pageSize: number;
		json?: true;
		parentFolder?: ParseAppFile;
	}): Promise<{ appFiles: AppFile[] } & ListMeta>;
	async listFiles(options: {
		page: number;
		pageSize: number;
		json: false;
		parentFolder?: ParseAppFile;
	}): Promise<{ appFiles: ParseAppFile[] } & ListMeta>;
	async listFiles(options: { page: number; pageSize: number; json?: boolean; parentFolder?: ParseAppFile }) {
		const { sessionToken } = this;

		if (!FolderService.isFolder(options.parentFolder)) {
			throw new Error("[FileService.listFiles]: folder mimeType must be 'folder'");
		}

		const parentFolderPath = FolderService.getPathForFolder(options.parentFolder);
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

	async getById(objectId: string) {
		const query = new Parse.Query(ParseAppFile).notEqualTo('mimeType', 'folder').equalTo('objectId', objectId);

		const appFile = query.first({ sessionToken: this.sessionToken });

		return appFile;
	}
}
