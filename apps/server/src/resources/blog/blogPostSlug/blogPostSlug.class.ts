import { className } from '@/shared/lib/constants';
import type { IBlogPostSlugWithParseRelations } from '@/shared/types/db/blogPostSlug.types';

export default class ParseBlogPostSlug extends Parse.Object<IBlogPostSlugWithParseRelations> {
	static className = className.BLOG_POST_SLUG;

	constructor(attributes: DeepPartial<IBlogPostSlugWithParseRelations> = {}) {
		super(ParseBlogPostSlug.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParseBlogPostSlug.className, ParseBlogPostSlug);
