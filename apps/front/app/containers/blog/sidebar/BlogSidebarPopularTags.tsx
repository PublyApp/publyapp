import { Box, Chip, Typography } from '@mui/material';

import type { IBlogTagsProps } from '@devist/ui-react/types/blog';

// ----------------------------------------------------------------------

type Props = {
	popularTags: IBlogTagsProps[];
};

const BlogSidebarPopularTags = ({ popularTags }: Props) => {
	return (
		<Box>
			<Typography variant="h5" sx={{ mb: 3 }}>
				Popular Tags
			</Typography>

			{popularTags.map((tag) => {
				return <Chip key={tag.label} label={tag.label} sx={{ m: 0.5 }} onClick={() => {}} />;
			})}
		</Box>
	);
};

export default BlogSidebarPopularTags;
