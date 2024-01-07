import { className } from '@/shared/lib/constants';
import type { AppFileWithRelations } from '@/shared/types/db/appFile.types';

export class ParseAppFile extends Parse.Object<AppFileWithRelations> {
	static className = className.APP_FILE;

	constructor(attributes?: DeepPartial<AppFileWithRelations>) {
		super(ParseAppFile.className, attributes as AppFileWithRelations);
	}
}

Parse.Object.registerSubclass(ParseAppFile.className, ParseAppFile);
