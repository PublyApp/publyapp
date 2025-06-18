import CloudinaryUploader from './upload/CloudinaryUploader';
import LocalDiskUploader from './upload/LocalDiskUploader';
import type { Uploader } from './upload/Uploader.interface';
import type { MulterMemoryFile } from '@/shared/validations/file/file-server.validations';
import CloudFlareUploader from './upload/CloudFlareUploader';

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
		storageFrom,
	}: {
		storageFrom: 'memory';
		file: MulterMemoryFile;
		folderPath?: string;
	}) {
		// upload the file here
		const result = await this.uploadAdapter.upload({
			file,
			storageFrom,
			folderPath,
		});

		return result;
	}

	async uploadMany(
		/* {
		files,
		folderPath,
	} */ _params: {
			files: Express.Multer.File[];
			folderPath?: string;
		},
	) {
		// const results = await async.map(
		// 	files,
		// 	async (file: Express.Multer.File) => {
		// 		const savedFile = await this.uploadOne({
		// 			file,
		// 			storageFrom,
		// 			folderPath,
		// 		});
		// 		return savedFile;
		// 	},
		// );

		// return results;
		// TODO: re-implement
		throw new Error('Not implemented');
	}

	public static get uploadAdapterMap() {
		const localDiskUploader = new LocalDiskUploader();
		const cloudinaryUploader = new CloudinaryUploader();
		const cloudFlareUploader = new CloudFlareUploader();

		const uploadAdapterMap = new Map([
			[localDiskUploader.provider, localDiskUploader as Uploader],
			[cloudinaryUploader.provider, cloudinaryUploader as Uploader],
			[cloudFlareUploader.provider, cloudFlareUploader as Uploader],
		]);

		return uploadAdapterMap;
	}
}
