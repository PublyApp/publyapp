import { className } from '@/shared/lib/constants';
import type { AppFileWithPointers } from '@/shared/types/appFile.types';

export class ParseAppFile extends Parse.Object<AppFileWithPointers> {
	static className = className.APP_FILE;

	constructor(attributes?: DeepPartial<AppFileWithPointers>) {
		super(ParseAppFile.className, attributes as AppFileWithPointers);
	}
}

Parse.Object.registerSubclass(ParseAppFile.className, ParseAppFile);
