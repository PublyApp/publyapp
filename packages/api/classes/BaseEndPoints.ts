import type ParseRestClient from '@org/parse-rest-client/ParseRestClient';

export type BaseEndPointsProps = {
	parseRestClient: ParseRestClient /*  apiPath: string */;
};

export default class BaseEndPoints {
	protected parseRestClient: ParseRestClient;

	constructor({ parseRestClient }: BaseEndPointsProps) {
		this.parseRestClient = parseRestClient;
	}
}
