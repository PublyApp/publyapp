import path from 'path';

import { logger } from 'parse-server';

import cloudinary from 'cloudinary';
import DataURIParser from 'datauri/parser';

// import type { UploadedFile } from '@/interfaces/files.interface';
export type UploadedFile = {
	publicId: string;
	url: string;
};

class FileService {
	public static uploadFile = async (file: Record<string, any>, folder: string): Promise<UploadedFile> => {
		try {
			const config = {
				unique_filename: true,
				folder,
				use_filename: true,
			};

			// format buffer to base64 string
			const file64 = FileService.formatBufferTo64(file);

			const savedFile = await cloudinary.v2.uploader.upload(file64.content ?? '', config);

			return {
				url: savedFile.secure_url,
				publicId: savedFile.public_id,
			};
		} catch (error) {
			logger.error(`[src/services/files.service.ts:uploadFile] error: ${error /* .message */}`);
			return Promise.reject(error);
		}
	};

	public static destroyFile = async (publicId: string) => {
		try {
			const fileResponse = await cloudinary.v2.uploader.destroy(publicId);

			if (fileResponse.result !== 'ok') {
				throw new Error(`Error while deleting file ${publicId}`);
			}

			return fileResponse;
		} catch (error) {
			logger.error(`[src/services/files.service.ts:destroyFile] error: ${error /* .message */}`);
			return Promise.reject(error);
		}
	};

	/**
	 * delete list files from db
	 * @param {*} parseObj
	 * @param {*} field
	 * @returns
	 */
	public static destroyFiles = async (parseObj: Parse.Object, field: string): Promise<undefined | void> => {
		try {
			if (!parseObj.has(field)) return;

			if (!Array.isArray(parseObj.get(field))) {
				throw new Error(`${field} should be an array`);
			}

			// eslint-disable-next-line no-restricted-syntax
			for (const file of parseObj.get(field)) {
				// eslint-disable-next-line no-await-in-loop
				await FileService.destroyFile(file.publicId);
			}
		} catch (error) {
			logger.error(`[src/services/files.service.ts:deleteFiles] error: ${error /* .message */}`);
		}
	};

	private static formatBufferTo64 = (file: any) => {
		const parser = new DataURIParser();
		return parser.format(path.extname(file.originalname).toString(), file.buffer);
	};
}

export default FileService;
