import type ParseSocialMediaPost from '@/server/modules/tenant/social-media/socialMediaPost.class';

interface SocialMediaPlatform {
	publishPost: (params: { post: ParseSocialMediaPost }) => Promise<void>;
}

export default SocialMediaPlatform;
