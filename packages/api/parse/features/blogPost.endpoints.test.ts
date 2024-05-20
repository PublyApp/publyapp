import { before, describe, it } from 'node:test';

import { expect } from 'chai';

import ParseRestClient from '@devist/parse-rest-client/ParseRestClient';
import { className } from '@devist/shared/lib/constants';

import { ParseApi } from '../ParseApi';

const parseRestClient = new ParseRestClient({
	applicationId: 'myAppId',
	parseServerUrl: 'http://localhost:6180/parse',
});

const parseApi = new ParseApi();
parseApi.setRestClient(parseRestClient);

let myPostId: string;

describe('Post endpoints', async () => {
	before(async () => {
		// login with that user
		await parseApi.users.passwordLogin('radandevist', 'azerty');
	});
	// after(async () => {
	// 	// delete the mock user
	// });

	await it('should create a post', async () => {
		const post = await parseApi.blogPosts.createBlogPost({
			content: 'content',
			description: 'description',
			locale: 'en',
			slug: 'slug',
			title: 'title',
		});

		const findPost = async () => {
			const iPost = await new Parse.Query(className.BLOG_POST).select([]).get(post.objectId);
			myPostId = iPost.id;
		};

		expect(post).to.be.an('object');
		expect(post).to.have.property('objectId');
		expect(findPost).to.not.throw();
	});

	it('should return a post', async () => {
		// assert.equal(1, 1);
		const post = await parseApi.blogPosts.getBlogPostBoEditForm({ id: myPostId });

		expect(post).to.be.an('object');
		expect(post).to.have.property('objectId');
		expect(post.objectId).to.be.equal(myPostId);
		expect(post).to.have.keys(['objectId', 'title', 'description', 'content', 'slug', 'locale']); // TODO: ??
	});
});
