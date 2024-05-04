export default class ParseRestError extends Error {
	code: number;

	statusCode: number;

	constructor({ statusCode, code, message }: { statusCode: number; code: number; message: string }) {
		super(message);
		this.name = 'ParseRestError';
		this.code = code;
		this.statusCode = statusCode;
		this.message = message;
	}
}
