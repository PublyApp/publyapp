import { className } from '@/shared/lib/constants';
import type { AppFileWithParseRelations } from '@/shared/types/db/appFile.types';

export class ParseAppFile extends Parse.Object<AppFileWithParseRelations> {
	static className = className.APP_FILE;

	constructor(attributes?: DeepPartial<AppFileWithParseRelations>) {
		super(ParseAppFile.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParseAppFile.className, ParseAppFile);
