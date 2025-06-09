export default class ParseRestError extends Error {
	parseCode: number;
	httpStatusCode: number;
	code: string;
	data?: Record<string, unknown>;

	constructor({
		httpStatusCode,
		parseCode,
		message,
		code,
		data,
	}: {
		httpStatusCode: number;
		parseCode: number;
		message: string;
		code: string;
		data?: Record<string, unknown>;
	}) {
		super(message);
		this.name = 'ParseRestError';
		this.parseCode = parseCode;
		this.httpStatusCode = httpStatusCode;
		this.message = message;
		this.code = code;
		this.data = data;
	}
}
