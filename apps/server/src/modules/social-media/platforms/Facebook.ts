/* eslint-disable class-methods-use-this */
import type ParseSocialMediaPost from '@/server/modules/social-media/socialMediaPost.class';

import type SocialMediaPlatform from './SocialMediaPlatform.interface';

export default class Facebook implements SocialMediaPlatform {
	apiUrl = 'https://graph.facebook.com/v11.0';

	publishPost({ post: _ }: { post: ParseSocialMediaPost }): Promise<void> {
		// Publish post to Facebook
		return Promise.resolve();
	}
}
