import FacebookSocialMedia from '../socialMedia/FacebookSocialMedia';

/* eslint-disable class-methods-use-this */
export default class SocialMediaPostService {
	async create(attributes: any): Promise<void> {
		//
	}

	async publish({ postId }: { postId: string | Parse.Object }): Promise<void> {
		let post: Parse.Object;

		if (typeof postId === 'string') {
			const postQuery = new Parse.Query('SocialPost');
			post = await postQuery /* .select(['text']) */
				.get(postId);
		} else {
			post = postId;

			// if (!post.get('text')) {
			// 	const postQuery = new Parse.Query('SocialPost');
			// 	post = await postQuery /* .select(['text']) */
			// 		.get(post.id);
			// }
		}

		new FacebookSocialMedia().publishPost({ post });
		// new Tiktok().publishPost(post.get('text'));

		// if (post.get('isPublished')) {
		// 	throw new Error('Post already published');
		// }
		//
	}

	async schedule({ postId, date }: { postId: string; date: Date }): Promise<void> {}
}
