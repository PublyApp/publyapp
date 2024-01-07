import _ from 'lodash';

import { roleEnum } from '@/shared/lib/constants';
import type { ParseAppFile } from '@/shared/lib/parse/classes/appFile.class';
import { ParsePost } from '@/shared/lib/parse/classes/post.class';
import type { IPostWithRelations } from '@/shared/types/db/post.types';

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

export default class PostService {
	sessionToken?: string;

	constructor({ sessionToken }: Props) {
		this.sessionToken = sessionToken;
	}

	async create({ author, content, description, slug, title, cover, locale }: PostCreateInput) {
		const attributes /* : DeepPartial<IPostWithRelations> */ = {
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
		} satisfies DeepPartial<IPostWithRelations>;

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
		acl.setWriteAccess(author.id, true);
		acl.setRoleWriteAccess(roleEnum.MODERATOR.name, true);

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
		} else if (published) {
			if (acl) {
				acl.setPublicReadAccess(true);
				post.setACL(acl);
			}
		}

		if (_.isNil(author)) {
			// do nothing
		} else if (author) {
			if (acl) {
				acl.setWriteAccess(author.id, true);
				post.setACL(acl);
			}
		}

		const attributes: DeepPartial<IPostWithRelations> = {
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

	getById(objectId: string) {
		const query = new Parse.Query(ParsePost).equalTo('objectId', objectId);
		return query.first({ sessionToken: this.sessionToken });
	}
}
