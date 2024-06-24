import type { IBlogPostSlug } from '@/shared/types/db/blogPostSlug.types';

import type ParseBlogPost from '../blogPost/blogPost.class';

import ParseBlogPostSlug from './blogPostSlug.class';

type Props = {
	sessionToken?: string;
	// headers?: Record<string, unknown>;
};

export default class BlogPostSlugService {
	sessionToken?: string;

	// headers?: Record<string, unknown>;

	constructor({ sessionToken /* , headers */ }: Props) {
		this.sessionToken = sessionToken;
		// this.headers = headers;
	}

	async getSlugObject(slug: string, { select = [] }: { select?: string[] } = { select: [] }) {
		const query = new Parse.Query(ParseBlogPostSlug).equalTo('slug', slug);

		if (select) {
			query.select(select as never);
		}

		const result = query.first({ sessionToken: this.sessionToken });

		return result;
	}

	async assignSlugToPost({ slug, post }: { post: ParseBlogPost; slug: ParseBlogPostSlug }) {
		slug.set('post', post);
		const savedSlug = await slug.save(null, { sessionToken: this.sessionToken });
		return savedSlug;
	}

	static toJSON(slug: ParseBlogPostSlug) {
		return slug.toJSON() as unknown as IBlogPostSlug;
	}

	async getOrCreateSlugForPost(slug: string, post: ParseBlogPost, { setIsCurrent }: { setIsCurrent?: boolean }) {
		let getCurrentSlugPromise = Promise.resolve<ParseBlogPostSlug | undefined>(undefined);

		if (setIsCurrent) {
			// find the current slug for the post
			getCurrentSlugPromise = new Parse.Query(ParseBlogPostSlug)
				.select([])
				.equalTo('post', post)
				.equalTo('isCurrent', true)
				.first({ sessionToken: this.sessionToken });
		}

		const handleCurrentSlug = async () => {
			if (setIsCurrent) {
				const currentSlug = await getCurrentSlugPromise;
				currentSlug?.set('isCurrent', false);
				currentSlug?.save(null, { sessionToken: this.sessionToken });
			}
		};

		const foundSlug = await this.getSlugObject(slug, { select: ['post'] });

		if (!foundSlug) {
			const newSlug = new ParseBlogPostSlug({ slug, isCurrent: setIsCurrent ? true : undefined });

			const assignSlugTopPostPromise = this.assignSlugToPost({ post, slug: newSlug });
			const handleCurrentSlugPromise = handleCurrentSlug();
			const [savedSlug] = await Promise.all([assignSlugTopPostPromise, handleCurrentSlugPromise]);

			return savedSlug;
		}

		const slugPost = foundSlug?.get('post');

		if (slugPost?.id !== post.id) {
			return 'E_SLUG_ALREADY_USED' as const;
		} // else, there's nothing to do, this slug is already assigned to the right post

		foundSlug.set('isCurrent', true);
		const saveFoundSlugPromise = foundSlug.save(null, { sessionToken: this.sessionToken });

		const handleCurrentSlugPromise = handleCurrentSlug();

		const [savedSlug] = await Promise.all([saveFoundSlugPromise, handleCurrentSlugPromise]);
		return savedSlug;
	}
}
