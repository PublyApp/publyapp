import type { IWebHostingProvider } from '@shared/types/webHostingProvider.types';
import { className } from '@shared/utils/constants';

export class WebHostingProvider extends Parse.Object<IWebHostingProvider> {
	constructor(attributes?: Partial<IWebHostingProvider>) {
		super(className.WEB_HOSTING_PROVIDER, attributes as IWebHostingProvider);
	}
}

Parse.Object.registerSubclass(className.WEB_HOSTING_PROVIDER, WebHostingProvider);
