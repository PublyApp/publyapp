import type { AppFile } from '@shared/types/appFile.types';
import { className } from '@shared/utils/constants';

export class ParseAppFile extends Parse.Object<AppFile> {
	constructor(attributes?: DeepPartial<AppFile>) {
		super(className.APP_FILE, attributes as AppFile);
	}
}

Parse.Object.registerSubclass(className.WEB_HOST, ParseAppFile);
