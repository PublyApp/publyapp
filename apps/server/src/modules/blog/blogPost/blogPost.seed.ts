import { faker } from '@faker-js/faker';
import asyncJs from 'async';
import _ from 'lodash';

import { USE_MASTER_KEY } from '@/server/lib/constants';
import { functionName } from '@/shared/lib/constants';

import type ParseUser from '../../auth/user/user.class';

import ParseBlogPost from './blogPost.class';

const generateTags = () => {
	const returnUndefined = faker.datatype.boolean({ probability: 0.25 });

	if (returnUndefined) {
		return undefined;
	}

	const arrayLength = faker.number.int({ min: 0, max: 5 });

	const tags = Array.from({ length: arrayLength }, () => {
		return faker.word.sample();
	});

	return tags;
};

export const blogPostSeedFactory = ({ user }: { user: ParseUser }) => {
	const post = new ParseBlogPost({
		tags: generateTags(),
		author: user,
		published: faker.datatype.boolean(),
	});

	post.set('seeded' as never, true as never);

	return post;
};

export const createBlogPosts = async ({ num, users }: { num: number; users: ParseUser[] }) => {
	const posts = Array.from({ length: num }, (_void) => {
		const user = faker.helpers.arrayElement(users);
		return blogPostSeedFactory({ user });
	});

	const chunksSave = _.chunk(posts, 100);

	const savedPosts: ParseBlogPost[] = [];

	const q = asyncJs.queue(async ({ chunk }: { chunk: ParseBlogPost[] }) => {
		const savedPostsChunk = await Parse.Object.saveAll(chunk, { batchSize: 100, useMasterKey: true });
		savedPosts.push(...savedPostsChunk);
	}, 5);

	q.push(
		chunksSave.map((chunk) => {
			return { chunk };
		}),
	);

	await q.drain();

	return savedPosts;
};

export const cleanBlogPosts = async () => {
	return Parse.Cloud.run(functionName.blog.removeSeededBlogPosts, null, USE_MASTER_KEY);
};
