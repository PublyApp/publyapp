import { className } from '@/shared/lib/constants';
import type { AppFileWithParseRelations } from '@/shared/types/db/appFile.types';

export default class ParseSocialMediaPost extends Parse.Object<AppFileWithParseRelations> {
	static className = className.APP_FILE;

	constructor(attributes?: DeepPartial<AppFileWithParseRelations>) {
		super(ParseSocialMediaPost.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParseSocialMediaPost.className, ParseSocialMediaPost);
