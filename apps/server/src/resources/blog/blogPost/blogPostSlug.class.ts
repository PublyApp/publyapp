import { className } from '@/shared/lib/constants';
import type { IBlogPostWithParseRelations } from '@/shared/types/db/blogPost.types';

export default class ParseBlogPostSlug extends Parse.Object<IBlogPostWithParseRelations> {
	static className = className.BLOG_POST_SLUG;

	constructor(attributes: DeepPartial<IBlogPostWithParseRelations> = {}) {
		super(ParseBlogPostSlug.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParseBlogPostSlug.className, ParseBlogPostSlug);
