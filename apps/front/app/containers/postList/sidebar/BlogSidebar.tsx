import { Stack, type StackProps } from '@mui/material';

import useResponsive from '@/ui-react/hooks/useResponsive';
import type { IAuthorProps } from '@/ui-react/types/author';
import type { IBlogCategoryProps /* IBlogPostProps, */, IBlogTagsProps } from '@/ui-react/types/blog';

// import type { IAdvertisementProps } from 'src/types/advertisement';
// import Advertisement from '../../advertisement';

import BlogSidebarAuthor from './BlogSidebarAuthor';
// import BlogSidebarCategories from './BlogSidebarCategories';
import BlogSidebarPopularTags from './BlogSidebarPopularTags';

// import BlogSidebarRecentPosts from './BlogSidebarRecentPosts';

// ----------------------------------------------------------------------

interface Props extends StackProps {
	author?: IAuthorProps;
	popularTags?: IBlogTagsProps[];
	categories?: IBlogCategoryProps[];
	// advertisement?: IAdvertisementProps;
	// recentPosts?: {
	// 	list: IBlogPostProps[];
	// };
}

const BlogSidebar = ({
	author,
	popularTags,
	// categories,
	// recentPosts,
	// advertisement,
	sx,
	...other
}: Props) => {
	// const theme = useTheme();
	const isMdUp = useResponsive('up', 'md');

	return (
		<>
			{author && isMdUp && <BlogSidebarAuthor author={author} />}

			{/* {isMdUp && ( */}
			{/* <TextField
				fullWidth
				hiddenLabel
				placeholder="Search..."
				InputProps={{
					startAdornment: (
						<InputAdornment position="start">
							<Iconify icon="carbon:search" width={24} sx={{ color: 'text.disabled' }} />
						</InputAdornment>
					),
				}}
				sx={{
					[theme.breakpoints.down('md')]: {
						display: 'none',
					},
				}}
			/> */}
			{/* )} */}

			<Stack
				spacing={5}
				sx={{
					pt: { xs: 8, md: 0 },
					pb: { xs: 8, md: 0 },
					...sx,
				}}
				{...other}
			>
				{/* {categories && <BlogSidebarCategories categories={categories} />} */}

				{/* {recentPosts && <BlogSidebarRecentPosts recentPosts={recentPosts} />} */}

				{popularTags && <BlogSidebarPopularTags popularTags={popularTags} />}

				{/* {advertisement && <Advertisement advertisement={advertisement} />} */}
			</Stack>
		</>
	);
};

export default BlogSidebar;
