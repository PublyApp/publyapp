import { className } from '@/shared/lib/constants';
import type { IBlogPostTag } from '@/shared/types/db/blogPostTag.types';

export default class ParseBlogPostTag extends Parse.Object<IBlogPostTag> {
	static className = className.BLOG_POST_TAG;

	constructor(attributes: DeepPartial<IBlogPostTag> = {}) {
		super(ParseBlogPostTag.className, attributes as never);
	}
}

Parse.Object.registerSubclass(ParseBlogPostTag.className, ParseBlogPostTag);
