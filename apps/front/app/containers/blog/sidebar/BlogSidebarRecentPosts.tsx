import { Stack, Typography } from '@mui/material';

import type { IBlogPostProps } from '@devist/ui-react/types/blog';

import PostItemMobile from '../components/PostItemMobile';

// ----------------------------------------------------------------------

type Props = {
	recentPosts: {
		list: IBlogPostProps[];
	};
};

const BlogSidebarRecentPosts = ({ recentPosts }: Props) => {
	const { list } = recentPosts;

	return (
		<Stack spacing={3}>
			<Typography variant="h5">Recent Posts</Typography>

			{list.map((post) => {
				return <PostItemMobile key={post.id} post={post} onSiderbar />;
			})}
		</Stack>
	);
};

export default BlogSidebarRecentPosts;
