import async from 'async';

import CloudinaryUploader from './upload/CloudinaryUploader';
import LocalDiskUploader from './upload/LocalDiskUploader';
import type { Uploader } from './upload/Uploader.interface';

export type FileServiceProps = {
	sessionToken: string | undefined;
	uploadAdapter: Uploader;
};

export default class FileService {
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

	async uploadOne({
		file,
		folderPath,
	}: {
		file: Express.Multer.File;
		folderPath?: string;
	}) {
		const filename = file.originalname;

		// upload the file here
		const result = await this.uploadAdapter.upload({
			buffer: file.buffer,
			name: filename,
			folderPath,
		});

		return result;
	}

	async uploadMany({
		files,
		folderPath,
	}: {
		files: Express.Multer.File[];
		folderPath?: string;
	}) {
		const results = await async.map(
			files,
			async (file: Express.Multer.File) => {
				const savedFile = await this.uploadOne({ file, folderPath });
				return savedFile;
			},
		);

		return results;
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
