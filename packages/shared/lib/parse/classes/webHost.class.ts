import { className /* , isServer */ } from '@/shared/lib/constants';
import type { WebHost } from '@/shared/types/db/webHost.types';

export class ParseWebHost extends Parse.Object<WebHost> {
	constructor(attributes?: DeepPartial<WebHost>) {
		super(className.WEB_HOST, attributes as WebHost);
	}
}

Parse.Object.registerSubclass(className.WEB_HOST, ParseWebHost);
