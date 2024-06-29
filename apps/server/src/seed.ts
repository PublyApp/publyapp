import './lib/parse/initParse';

import { cleanUsers, createUsers } from './resources/auth/user/user.seed';
import { cleanBlogPosts, createBlogPosts } from './resources/blog/blogPost/blogPost.seed';

if (!global.LOCAL || global.TEST_ONLINE_IN_LOCAL) {
	throw new Error('Running seed script only allowed in local');
}

const run = async () => {
	const results1 = await cleanUsers();
	console.log('✅✅', results1);
	const results2 = await cleanBlogPosts();
	console.log('✅✅', results2);

	const users = await createUsers({ num: 50 });
	console.log('users', users.length);
	const posts = await createBlogPosts({ num: 20_000, users });
	console.log('posts', posts.length);
};

run();
