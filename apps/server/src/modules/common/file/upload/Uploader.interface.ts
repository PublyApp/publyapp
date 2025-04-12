export type UploadInput = { name: string; buffer: Buffer; folderPath?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UploadResult<Meta = Record<string, any>> = {
	url: string;
	meta?: Meta;
	provider?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Uploader<Meta = Record<string, any>> {
	readonly provider: string;
	upload(params: UploadInput): Promise<UploadResult<Meta>>;
}
