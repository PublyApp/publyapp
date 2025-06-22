export class HttpException extends Error {
	public status: number;
	public message: string;
	public xcode?: string;
	public body?: Record<string, unknown>;
	public meta?: Record<string, unknown>;

	constructor(
		status: number,
		message: string,
		options?: {
			xcode?: string;
			body?: Record<string, unknown>; // body will be forwarded to the client
			// meta is not to be exposed to the client,
			// use for displaying useful informations when debugging for example
			meta?: Record<string, unknown>;
		},
	) {
		super(message);
		this.name = 'HttpException';
		this.status = status;
		this.message = message;
		this.xcode = options?.xcode;
		this.meta = options?.meta;
	}
}
