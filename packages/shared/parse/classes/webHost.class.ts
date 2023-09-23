import type { WebHost } from '@shared/types/webHost.types';
import { className } from '@shared/utils/constants';

export class ParseWebHost extends Parse.Object<WebHost> {
	constructor(attributes?: DeepPartial<WebHost>) {
		super(className.WEB_HOST, attributes as WebHost);
	}
}

Parse.Object.registerSubclass(className.WEB_HOST, ParseWebHost);
