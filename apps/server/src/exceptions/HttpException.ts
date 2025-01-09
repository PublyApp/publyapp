export class HttpException extends Error {
	public status: number;

	public message: string;

	xcode?: string;

	constructor(status: number, message: string, xcode?: string) {
		super(message);
		this.name = 'HttpException';
		this.status = status;
		this.message = message;
		this.xcode = xcode;
	}
}
