export class ClientException extends Error {
	public code: number;

	public message: string;

	constructor(code: number, message: string) {
		super(message);
		this.name = 'ClientException';
		this.code = code;
		this.message = message;
	}

	static readonly AUTH_REQUIRED = 1;
}
