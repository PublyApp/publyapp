import type ParseSocialMediaPost from '@/server/modules/social-media/socialMediaPost.class';

interface SocialMediaPlatform {
	publishPost: (params: { post: ParseSocialMediaPost }) => Promise<void>;
}

export default SocialMediaPlatform;
