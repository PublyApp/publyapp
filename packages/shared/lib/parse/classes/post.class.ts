import { className } from '@/shared/lib/constants';
import type { IPostWithRelations } from '@/shared/types/db/post.types';

export class ParsePost extends Parse.Object<IPostWithRelations> {
	static className = className.APP_FILE;

	constructor(attributes?: DeepPartial<IPostWithRelations>) {
		super(className.POST, attributes as IPostWithRelations);
	}
}

Parse.Object.registerSubclass(ParsePost.className, ParsePost);
