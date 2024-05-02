export type UploadInput = { name: string; buffer: Buffer };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UploadResult = { url: string; meta?: Record<string, any> };

interface UploaderInterface {
	readonly provider: string;
	upload(params: UploadInput): Promise<UploadResult>;
}

export default UploaderInterface;
