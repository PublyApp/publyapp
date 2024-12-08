import async from 'async';
import _ from 'lodash';
import { nanoid } from 'nanoid';
import sharp from 'sharp';

import { IMAGE_FORMAT_CONFIG } from '@devist/shared/lib/constants';
import type { ListMeta } from '@devist/shared/types/any.types';
import type { AppFile, ImageFormatData, ImageFormatType } from '@devist/shared/types/db/appFile.types';

import { applySkipAndLimit } from '@/server/lib/parse/query.utils';
import ParseAppFile from '@/server/modules/tenant/file-manager/appFile/appFile.class';
import { addSuffixToFileName } from '@/server/utils/any.utils';

import AppFileFolderService from '../appFileFolder/appFileFolder.service';

import CloudinaryUploader from './upload/CloudinaryUploader';
import LocalDiskUploader from './upload/LocalDiskUploader';
import { type Uploader } from './upload/Uploader.interface';

export type FileServiceProps = {
	sessionToken: string | undefined;
	uploadAdapter: Uploader;
};

type ServiceFormatData = Omit<ImageFormatData, 'url'> & {
	buffer: Buffer;
};

type ServiceFormatsOut = Record<ImageFormatType, ImageFormatData>;

type ServiceFormatsIn = Record<ImageFormatType, ServiceFormatData>;

// type ListFilesOptions = { page: number; pageSize: number; json?: boolean };

export type CreateAppFileInput = {
	filename: string;
	displayName: string;
	mimetype: string;
	path: string;
	url: string;
	size: number;
	provider: string;
	height?: number;
	width?: number;
	formats?: ServiceFormatsOut;
	parentFolder?: ParseAppFile;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	meta?: Record<string, any>;
	// file: Express.Multer.File;
};

export default class AppFileService {
	sessionToken?: string;

	uploadAdapter: Uploader;

	constructor({ sessionToken, uploadAdapter }: FileServiceProps) {
		this.sessionToken = sessionToken;
		this.uploadAdapter = uploadAdapter;
	}

	static isImage(file: Express.Multer.File | string) {
		if (typeof file === 'string') {
			return file.startsWith('image/');
		}

		return file.mimetype.startsWith('image/');
	}

	private static async _generateImageFormats(file: Express.Multer.File, uid: string) {
		if (!AppFileService.isImage(file)) {
			throw new Error("[AppFileService.generateImageFormats]: File must be of type 'image/*'");
		}

		const { originalname, buffer } = file;
		// const uid = nanoid();

		let formats: ServiceFormatsIn | undefined;

		const getFormatsPromise = Promise.all(
			Object.entries(IMAGE_FORMAT_CONFIG).map(async ([format, config]) => {
				const { data: formatBuffer, info: formatInfo } = await sharp(buffer)
					.resize(config.width, config.height, {
						fit: 'inside',
					})
					.toBuffer({ resolveWithObject: true });

				const formatFileName = addSuffixToFileName(originalname, `_${uid}_@${format}`);

				if (!formats) {
					formats = {} as never;
				}

				const imageFormatData: ServiceFormatData = {
					name: formatFileName,
					size: formatInfo.size,
					height: formatInfo.height,
					width: formatInfo.width,
					buffer: formatBuffer,
				};

				Object.assign(formats, { [format]: imageFormatData });
			}),
		);

		await getFormatsPromise;

		return formats;
	}

	private async _createRecord(params: CreateAppFileInput) {
		const parseFile = new ParseAppFile({
			name: params.filename,
			displayName: params.displayName,
			mimeType: params.mimetype,
			path: params.path,
			url: params.url,
			size: params.size,
			provider: params.provider,
			folder: params.parentFolder,
			...(params.meta && { meta: params.meta }),
		});

		if (AppFileService.isImage(params.mimetype) && !_.isEmpty(params.formats)) {
			parseFile.set('formats', params.formats);
			parseFile.set('height', params.height);
			parseFile.set('width', params.width);
		}

		// logger.info(parseFile.toJSON());
		return parseFile.save(null, { sessionToken: this.sessionToken });
	}

	async createOne({ file, parentFolder }: { file: Express.Multer.File; parentFolder?: ParseAppFile }) {
		if (!AppFileFolderService.isFolder(parentFolder)) {
			throw new Error("[AppFileService.createOne]: parentFolder mimeType must be 'folder'");
		}

		const uid = nanoid();
		let formats: ServiceFormatsIn | undefined;

		if (AppFileService.isImage(file)) {
			// create different files formats
			formats = await AppFileService._generateImageFormats(file, uid);
		} else {
			// do nothing
		}

		const filename = addSuffixToFileName(file.originalname, `_${uid}_@original`);

		// upload the file here
		const mainPromise = this.uploadAdapter.upload({
			buffer: file.buffer,
			name: filename,
		});

		let formatsPromise: Promise<undefined | void[]> = new Promise((resolve) => {
			resolve(undefined);
		});

		let outFormats: ServiceFormatsOut | undefined;

		if (formats && !_.isEmpty(formats)) {
			formatsPromise = Promise.all(
				Object.entries(formats).map(async ([format, data]) => {
					const result = await this.uploadAdapter.upload({ buffer: data.buffer, name: data.name });

					if (!outFormats) {
						outFormats = {} as never;
					}

					const outFormatData = {
						..._.omit(data, 'buffer'),
						url: result.url,
						meta: result.meta,
					};

					Object.assign(outFormats, {
						[format]: outFormatData,
					});
				}),
			);
		}

		await Promise.all([mainPromise, formatsPromise]);

		const result = await mainPromise;

		// save file's datas into the database
		return this._createRecord({
			formats: outFormats,
			parentFolder,
			provider: this.uploadAdapter.provider,
			// filename: file.originalname,
			filename,
			displayName: file.originalname,
			mimetype: file.mimetype,
			// path: AppFileFolderService.getPathForFolder(parentFolder) + file.originalname,
			path: AppFileFolderService.getPathForFolder(parentFolder) + filename,
			size: file.size,
			url: result.url,
			meta: result.meta,
		});
	}

	// static checkMimeType(appFile: ParseAppFile | undefined, mimeTypes: string[], throws?: true | undefined): void;
	// static checkMimeType(appFile: ParseAppFile | undefined, mimeTypes: string[], throws: false): boolean;
	// // eslint-disable-next-line consistent-return
	// static checkMimeType(appFile: ParseAppFile | undefined, mimeTypes: string[], throws = true) {
	// 	const CONDITION = !_.isNil(appFile) && !mimeTypes.includes(appFile.get('mimeType'));

	// 	if (throws) {
	// 		if (CONDITION) {
	// 			throw new Error('[AppFileService.checkMimeType]: Invalid mimeType');
	// 		}
	// 	} else {
	// 		return CONDITION;
	// 	}
	// }

	async createMany({ files, parentFolder }: { files: Express.Multer.File[]; parentFolder?: ParseAppFile }) {
		if (!AppFileFolderService.isFolder(parentFolder)) {
			throw new Error("[AppFileService.createMany]: folder mimeType must be 'folder'");
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

		if (!AppFileFolderService.isFolder(options.parentFolder)) {
			throw new Error("[AppFileService.listFiles]: folder mimeType must be 'folder'");
		}

		const parentFolderPath = AppFileFolderService.getPathForFolder(options.parentFolder);
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

	async getById(objectId: string, options: { select?: string[] } = {}) {
		const query = new Parse.Query(ParseAppFile).notEqualTo('mimeType', 'folder').equalTo('objectId', objectId);

		if (options.select) {
			query.select(options.select as never);
		}

		return query.first({ sessionToken: this.sessionToken });
	}

	public static get uploadAdapterMap() {
		const localDiskUploader = new LocalDiskUploader();
		const cloudinaryUploader = new CloudinaryUploader();

		const uploadAdapterMap = new Map([
			[localDiskUploader.provider, localDiskUploader as Uploader],
			[cloudinaryUploader.provider, cloudinaryUploader as Uploader],
		]);

		return uploadAdapterMap;
	}

	public static get defaultUploadAdapter(): Uploader {
		// return new LocalDiskUploader();
		return new CloudinaryUploader();
	}
}
