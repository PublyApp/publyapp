export default class ParseRestError extends Error {
	parseCode: number;

	statusCode: number;

	code: string;

	constructor({
		statusCode,
		parseCode,
		message,
		code,
	}: {
		statusCode: number;
		parseCode: number;
		message: string;
		code: string;
	}) {
		super(message);
		this.name = 'ParseRestError';
		this.parseCode = parseCode;
		this.statusCode = statusCode;
		this.message = message;
		this.code = code;
	}
}
