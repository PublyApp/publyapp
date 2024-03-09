import { className } from '@/shared/lib/constants';
import type { IPostWithParseRelations } from '@/shared/types/db/post.types';

export default class ParsePost extends Parse.Object<IPostWithParseRelations> {
	static className = className.POST;

	constructor(attributes: DeepPartial<IPostWithParseRelations> = {}) {
		super(ParsePost.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParsePost.className, ParsePost);
