import { className } from '@/shared/lib/constants';
import type { IBlogPostWithParseRelations } from '@/shared/types/db/blogPost.types';

export default class ParseBlogPost extends Parse.Object<IBlogPostWithParseRelations> {
	static className = className.BLOG_POST;

	constructor(attributes: DeepPartial<IBlogPostWithParseRelations> = {}) {
		super(ParseBlogPost.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParseBlogPost.className, ParseBlogPost);
