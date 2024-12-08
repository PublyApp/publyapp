export type UploadInput = { name: string; buffer: Buffer };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UploadResult = { url: string; meta?: Record<string, any> };

export interface Uploader {
	readonly provider: string;
	upload(params: UploadInput): Promise<UploadResult>;
}

// export default Uploader;
