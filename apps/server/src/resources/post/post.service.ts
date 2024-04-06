import _ from 'lodash';

import { env } from '@/server/lib/env';
import type ParseAppFile from '@/server/lib/parse/classes/appFile.class';
import ParsePost from '@/server/lib/parse/classes/post.class';
import type ParseUser from '@/server/lib/parse/classes/user.class';
import { DEFAULT_PAGE_SIZE, fileProvider } from '@/shared/lib/constants';
import { appLocales, defaultLocale, type AppLocale } from '@/shared/lib/i18n/resources';
import type {
	IPostWithParseRelations,
	IPostWithRelations,
	TranslatedIPostWithRelations,
} from '@/shared/types/db/post.types';

import { applySkipAndLimit, applySorting } from '../../lib/parse/utils';

type Props = {
	sessionToken?: string;
	headers?: Record<string, unknown>;
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
	coverUrl?: string;
	publishDate?: Date;
	updateDate?: Date;
	tags?: string[];
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
	json?: boolean;
	select?: string[];
	include?: string[];
	exclude?: string[];
	// sessionToken?: string;
	fromPublic?: boolean;
};

type FindPostFrontListParams = Pick<FindPostInput, 'page' | 'pageSize' | 'sorting' | 'locale'>;
type FindPostBoTableParams = FindPostFrontListParams & { fromPublic: boolean };

export default class PostService {
	sessionToken?: string;

	// headers?: Record<string, unknown>;

	constructor({ sessionToken /* , headers */ }: Props) {
		this.sessionToken = sessionToken;
		// this.headers = headers;
	}

	async create(input: PostCreateInput) {
		const { author, content, description, slug, title, cover, locale, coverUrl, publishDate, tags, updateDate } = input;

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
			coverUrl,
			publishDate,
			tags,
			updateDate,
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

	async update(post: ParsePost, input: PostUpdateInput) {
		const {
			description,
			locale,
			slug,
			title,
			content,
			published,
			author,
			cover,
			coverUrl,
			publishDate,
			tags,
			updateDate,
		} = input;

		const { sessionToken } = this;

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
			coverUrl,
			publishDate,
			tags,
			updateDate,
		};

		if (attributes.translation?.[locale as never]) {
			post.set(`translation.${locale}` as never, attributes.translation[locale as never]);
		}

		const attrs = _.omitBy(attributes, (value, key) => {
			if (['translation'].includes(key)) return true;
			return _.isNil(value);
		});

		return post.save(attrs as never, { sessionToken });
	}

	async getById(objectId: string, options: { select?: string[]; include?: string[] } = {}) {
		const query = new Parse.Query(ParsePost).equalTo('objectId', objectId);

		if (options.select) {
			query.select(options.select as never);
		}

		if (options.include) {
			query.include(options.include as never);
		}

		return query.first({ sessionToken: this.sessionToken });
	}

	async getBySlug(slug: string, { select, include }: { select?: string[]; include?: string[] } = {}) {
		const query = new Parse.Query(ParsePost).equalTo('slug', slug);

		if (select) {
			query.select(select as never);
		}

		if (include) {
			query.include(include as never);
		}

		return query.first({ sessionToken: this.sessionToken });
	}

	async find(params: Omit<FindPostInput, 'json'> & { json: true }): Promise<IPostWithRelations[]>;
	async find(params: Omit<FindPostInput, 'json'> & { json?: false | undefined }): Promise<ParsePost[]>;
	async find({
		page = 1,
		pageSize = DEFAULT_PAGE_SIZE,
		sorting = [],
		// locale = defaultLocale,
		locale,
		select,
		include,
		exclude,
		// ===
		json = false,
		fromPublic = true,
		// sessionToken = this.sessionToken,
	}: FindPostInput) {
		const query = new Parse.Query(ParsePost).notEqualTo('deleted' as never, true as never);

		applySkipAndLimit(query, { type: 'page', page, pageSize });

		if (sorting && !_.isEmpty(sorting)) {
			applySorting(query, sorting);
		}

		// locale filter
		if (locale) {
			query.exists(`translation.${locale}` as never);
		}

		if (include) {
			query.include(include as never);
		}

		if (select) {
			query.select(select as never);
		}

		if (exclude) {
			query.exclude(exclude as never);
		}

		const sessionToken = fromPublic ? undefined : this.sessionToken;

		const posts = await query.find({
			sessionToken,
			// json,
			/* , context: { headers: this.headers, fromPublic } */
		});

		if (json) {
			const jsonPosts = posts.map((post) => {
				return PostService.toJSON(post);
			});

			return jsonPosts;
		}

		return posts;

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

	static getExcludedTranslations(locale: AppLocale) {
		const excludedTranslations: string[] = [];

		appLocales.forEach((iLocale) => {
			if (iLocale === locale) return;
			excludedTranslations.push(`translation.${iLocale}`);
		});

		return excludedTranslations;
	}

	async findPostBoTable({ page, pageSize, sorting, locale = defaultLocale, fromPublic }: FindPostBoTableParams) {
		const include = ['author'];
		// const exclude = [...PostService.getExcludedTranslations(locale as never), `translation.${locale}.content`];
		const select = [`translation.${locale}.title`, 'tags', 'viewCount', 'published'];

		const posts = await this.find({
			page,
			pageSize,
			sorting,
			locale,
			include,
			select,
			/* exclude, */ json: true,
			fromPublic,
		});

		const finalPosts = posts.map((post) => {
			_.assign(post, post.translation[locale]);
			_.set(post, 'locale', locale);
			return post as unknown as TranslatedIPostWithRelations;
		});

		return finalPosts;
	}

	async findPostFrontList({ page, pageSize, sorting, locale = defaultLocale }: FindPostFrontListParams) {
		const include = ['author', 'cover'];
		// const exclude = PostService.getExcludedTranslations(locale as never);
		const select = [
			'slug',
			'tags',
			`translation.${locale}.title`,
			`translation.${locale}.description`,
			'viewCount',
			'publishDate',
			'author',

			'cover',
			'cover.url',
			'cover.provider',

			'author.firstName',
			'author.lastName',
		];

		const posts = await this.find({
			page,
			pageSize,
			sorting,
			locale,
			include,
			// exclude,
			select,
			json: true,
			fromPublic: true,
		});

		const finalPosts = posts.map((post) => {
			_.assign(post, post.translation[locale], {
				locale,
			});

			if (post.cover) {
				let fileUrl = post.cover.url;

				if (post.cover.provider === fileProvider.LOCAL_DISK || fileUrl.startsWith('/')) {
					fileUrl = env.SERVER_URL + fileUrl;
					_.set(post.cover, 'url', fileUrl);
				}
			}

			return post as unknown as TranslatedIPostWithRelations;
		});

		return finalPosts;
	}

	// I expect this function to be only for public usage (for now)
	// eslint-disable-next-line class-methods-use-this
	async findMostViewedTags() {
		// const pipeline: Parse.PipelineStage[] = [
		// 	{ $unwind: '$tags' },
		// 	{ $group: { _id: '$tags', count: { $sum: 1 } } },
		// 	{ $project: { _id: 0, tag: '$_id', count: '$count' } },
		// ];
		const pipeline: Parse.PipelineStage[] = [
			{
				$match: {
					tags: { $exists: true },
					published: true,
				},
			},
			{ $unwind: '$tags' },
			{
				$group: {
					_id: '$tags',
					tag: { $first: '$tags' }, // Get the first tag from the array
					viewCount: { $sum: '$viewCount' },
					postCount: { $sum: 1 },
				},
			},

			{ $sort: { viewCount: -1 } }, // Sort by viewCount in descending order

			{ $project: { _id: 0, tag: '$tag', viewCount: '$viewCount', postCount: '$postCount' } }, // Remove unnecessary field
		];

		const query = new Parse.Query(ParsePost);

		const results = await query.aggregate(pipeline);
		return results;
	}

	async deleteById(objectId: string) {
		const query = new Parse.Query(ParsePost).equalTo('objectId', objectId);
		const post = await query.first({ sessionToken: this.sessionToken });

		// todo: add error message if no post was found
		post?.set('deleted' as never, true as never);

		return post?.save(null, { sessionToken: this.sessionToken });
	}

	static async searchPostTag(searchQuery: string) {
		const query = new Parse.Query(ParsePost);

		const pipeline: Parse.PipelineStage[] = [
			{
				$search: {
					index: 'default',
					autocomplete: {
						query: searchQuery,
						path: 'tags',
						fuzzy: {
							maxEdits: 2,
							maxExpansions: 100,
						},
						tokenOrder: 'any',
					},
				},
			},
			{
				$project: {
					tags: {
						$filter: {
							input: '$tags',
							as: 'item',
							cond: {
								$regexMatch: {
									input: '$$item',
									regex: new RegExp(searchQuery, 'i'),
								},
							},
						},
					},
				},
			},
			{
				$unwind: '$tags',
			},
			{
				$group: {
					_id: '$tags',
				},
			},
			// { $limit: 5 },
			// { $skip: 0 },
			{
				$project: {
					_id: 0,
					name: '$_id',
				},
			},
		];

		return query.aggregate(pipeline);
	}

	static toJSON(post: ParsePost) {
		const finalPost = post.toJSON();

		_.unset(finalPost, 'author.__type');
		_.unset(finalPost, 'cover.__type');
		_.set(finalPost, 'publishDate', (finalPost.publishDate as any)?.iso);
		_.set(finalPost, 'updateDate', (finalPost.updateDate as any)?.iso);

		return finalPost as unknown as IPostWithRelations;
	}
}
