import _ from 'lodash';

import { DEFAULT_PAGE_SIZE } from '@/shared/lib/constants';
import { defaultLocale, type AppLocale } from '@/shared/lib/i18n/resources';
import type { ParseAppFile } from '@/shared/lib/parse/classes/appFile.class';
import { ParsePost } from '@/shared/lib/parse/classes/post.class';
import type { ParseUser } from '@/shared/lib/parse/classes/user.class';
import type { IPostWithParseRelations } from '@/shared/types/db/post.types';

import { applySkipAndLimit, applySorting } from '../lib/parse';

type Props = {
	sessionToken?: string;
};

// type PostUpdateInput = {
// 	objectId?: string;
// 	locale: AppLocale;
// 	title: string;
// 	slug: string;
// 	description: string;
// 	author: ParseUser;
// 	content: string;
// 	published?: boolean;
// };

type PostCreateInput = {
	locale: string;
	title: string;
	slug: string;
	description: string;
	content: string;
	author: Parse.User;
	cover?: ParseAppFile;
};

type PostUpdateInput = Partial<Omit<PostCreateInput, 'locale'>> & {
	locale: string;
	published?: boolean;
	// post: ParsePost;
};

type FindPostInput = {
	page?: number;
	pageSize?: number;
	sorting?: { id: string; desc: boolean }[];
	locale?: AppLocale;
};

export default class PostService {
	sessionToken?: string;

	constructor({ sessionToken }: Props) {
		this.sessionToken = sessionToken;
	}

	async create({ author, content, description, slug, title, cover, locale }: PostCreateInput) {
		const attributes: DeepPartial<IPostWithParseRelations> = {
			slug,
			translation: {
				[locale]: {
					title,
					description,
					content,
				},
			},
			author,
			cover,
		}; /*  satisfies DeepPartial<IPostWithParseRelations> */

		// create an mongo unique index and let mongo handle this
		// const postWithSameSlug = await new Parse.Query(ParsePost)
		// 	.equalTo('slug', slug)
		// 	.first({ sessionToken: this.sessionToken });

		// if (postWithSameSlug) {
		// 	throw new Error('A (Post) with the same (slug) already exists');
		// }

		const post = new ParsePost(attributes);

		// set ACL
		const acl = new Parse.ACL();
		acl.setPublicReadAccess(false);
		// author can read and write
		acl.setReadAccess(author.id, true);
		acl.setWriteAccess(author.id, true);

		post.setACL(acl);

		return post.save(null, { sessionToken: this.sessionToken });
	}

	async update(
		post: ParsePost,
		{ description, locale, slug, title, content, published, author, cover }: PostUpdateInput,
	) {
		const { sessionToken } = this;
		// let existingPost: ParsePost | undefined;

		// if (objectId) {
		// 	existingPost = await new Parse.Query(ParsePost).equalTo('objectId', objectId).first({ sessionToken });

		// 	if (!existingPost) {
		// 		throw new Error('(Post) with id (xxx) not found');
		// 	}
		// }
		const acl = post.getACL();

		if (_.isNil(published)) {
			// do nothing
		} else if (acl) {
			acl.setPublicReadAccess(published);
			post.setACL(acl);
		}

		if (_.isNil(author)) {
			// do nothing
		} else if (author) {
			if (acl) {
				const formerAuthor = post.get('author') as unknown as ParseUser;

				if (formerAuthor.id !== author.id) {
					// give permission to the new author
					acl.setReadAccess(author.id, true);
					acl.setWriteAccess(author.id, true);

					// remove permission from the former author
					acl.setReadAccess(formerAuthor.id, false);
					acl.setWriteAccess(formerAuthor.id, false);
				}

				post.setACL(acl);
			}
		}

		const attributes: DeepPartial<IPostWithParseRelations> = {
			slug,
			published,
			author,
			cover,
			translation: {
				[locale]: {
					//
					title,
					description,
					content,
				},
			},
		};

		return post.save(attributes as never, { sessionToken });
	}

	getById(objectId: string, options: { select?: string[] } = {}) {
		const query = new Parse.Query(ParsePost).equalTo('objectId', objectId);

		if (options.select) {
			query.select(options.select as never);
		}

		return query.first({ sessionToken: this.sessionToken });
	}

	getBySlug(slug: string, { select }: { select?: string[] } = {}) {
		const query = new Parse.Query(ParsePost).equalTo('slug', slug);

		if (select) {
			query.select(select as never);
		}

		return query.first({ sessionToken: this.sessionToken });
	}

	find({ page = 1, pageSize = DEFAULT_PAGE_SIZE, sorting = [], locale = defaultLocale }: FindPostInput) {
		const query = new Parse.Query(ParsePost);
		applySkipAndLimit(query, { type: 'page', page, pageSize });

		if (sorting && !_.isEmpty(sorting)) {
			applySorting(query, sorting);
		}

		if (locale) {
			query.exists(`translation.${locale}` as never);
		}

		return query.find({ sessionToken: this.sessionToken });

		// const sortingOperations: Record<string, 1 | -1> = {};
		// if (sorting && !_.isEmpty(sorting)) {
		// 	for (const element of sorting) {
		// 		sortingOperations[element.id] = element.desc ? -1 : 1;
		// 	}
		// }
		// const pipeline: PipelineStage[] = [
		// 	{
		// 		$match: {},
		// 	},
		// 	...(sorting && !_.isEmpty(sorting) ? [{ $sort: sortingOperations }] : []),
		// 	{ $skip: skip },
		// 	{ $limit: limit },
		// 	{ $project: { _id: 1 } },
		// ];
		// return postService.aggregate(pipeline);
	}
}
