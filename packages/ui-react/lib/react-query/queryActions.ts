export default class QueryActions {
	readonly auth: any;

	constructor({ parseApi }) {
		this.auth = new AuthActions(parseApi);
	}
}
