import { className } from '@/shared/lib/constants';
import type { IPostWithParseRelations } from '@/shared/types/db/blogPost.types';

export default class ParseBlogPost extends Parse.Object<IPostWithParseRelations> {
	static className = className.BLOG_POST;

	constructor(attributes: DeepPartial<IPostWithParseRelations> = {}) {
		super(ParseBlogPost.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParseBlogPost.className, ParseBlogPost);
