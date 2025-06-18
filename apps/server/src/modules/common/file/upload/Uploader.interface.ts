import type {
	MulterDiskFile,
	MulterMemoryFile,
} from '@/shared/validations/file/file-server.validations';

// export type UploadInput = {name: string; buffer: Buffer; folderPath?: string };
export type UploadInput =
	| {
			storageFrom: 'memory';
			file: MulterMemoryFile;
			folderPath?: string;
	  }
	| {
			storageFrom: 'disk';
			file: MulterDiskFile;
			folderPath?: string;
	  };

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type UploadResult<Meta = Record<string, any>> = {
	url: string;
	meta?: Meta;
	provider?: string;
};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export interface Uploader<Meta = Record<string, any>> {
	readonly provider: string;
	upload(params: UploadInput): Promise<UploadResult<Meta>>;
}
