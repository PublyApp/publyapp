import type ParseSocialMediaPost from '@/server/lib/parse/classes/socialMediaPost.class';

interface SocialMediaPlatform {
	publishPost: (params: { post: ParseSocialMediaPost }) => Promise<void>;
}

export default SocialMediaPlatform;
