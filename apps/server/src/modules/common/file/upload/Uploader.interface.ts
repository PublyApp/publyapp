export type UploadInput = { name: string; buffer: Buffer; folderPath?: string };

export type UploadResult<Meta = Record<string, any>> = {
	url: string;
	meta?: Meta;
	provider?: string;
};

export interface Uploader<Meta = Record<string, any>> {
	readonly provider: string;
	upload(params: UploadInput): Promise<UploadResult<Meta>>;
}
