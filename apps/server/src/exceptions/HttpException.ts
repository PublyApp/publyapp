export class HttpException extends Error {
	public status: number;
	public message: string;
	public xcode?: string;
	public body?: Record<string, unknown>;

	constructor(
		status: number,
		message: string,
		options?: { xcode?: string; body?: Record<string, unknown> },
	) {
		super(message);
		this.name = 'HttpException';
		this.status = status;
		this.message = message;
		this.xcode = options?.xcode;
		this.body = options?.body;
	}
}
