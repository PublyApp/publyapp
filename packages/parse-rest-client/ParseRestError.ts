export default class ParseRestError extends Error {
	constructor(
		public code: number,
		message: string,
	) {
		super(message);
		this.name = 'ParseRestError';
		this.code = code;
		this.message = message;
	}
}
