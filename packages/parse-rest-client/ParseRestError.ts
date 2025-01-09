export default class ParseRestError extends Error {
	parseCode: number;

	httpStatusCode: number;

	code: string;

	constructor({
		httpStatusCode,
		parseCode,
		message,
		code,
	}: {
		httpStatusCode: number;
		parseCode: number;
		message: string;
		code: string;
	}) {
		super(message);
		this.name = 'ParseRestError';
		this.parseCode = parseCode;
		this.httpStatusCode = httpStatusCode;
		this.message = message;
		this.code = code;
	}
}
