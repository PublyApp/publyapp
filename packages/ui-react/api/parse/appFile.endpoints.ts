import type ParseRestClient from 'packages/parse-rest-client/ParseRestClient';

import { type FindApFileFunctionReturn } from '@/server/resources/appFile/appFile.functions';
import { functionName } from '@/shared/lib/constants';

export default class AppFileEndPoints {
	constructor(private parseRestClient: ParseRestClient) {}

	async findAppFile() {
		return this.parseRestClient.cloudRun<FindApFileFunctionReturn>(functionName.findAppFile);
	}
}
