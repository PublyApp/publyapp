import type ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

export type BaseEndPointsProps = { parseRestClient: ParseRestClient /*  apiPath: string */ };

export default class BaseEndPoints {
	protected parseRestClient: ParseRestClient;

	// protected apiPath: string;

	constructor({ parseRestClient /* , apiPath  */ }: BaseEndPointsProps) {
		// this.apiPath = apiPath;
		this.parseRestClient = parseRestClient;
	}
}
