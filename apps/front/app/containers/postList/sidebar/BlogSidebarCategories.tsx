import { Box, Link, Stack, Typography } from '@mui/material';

import type { IBlogCategoryProps } from '@devist/ui-react/types/blog';

// ----------------------------------------------------------------------

type Props = {
	categories: IBlogCategoryProps[];
};

const BlogSidebarCategories = ({ categories }: Props) => {
	return (
		<Stack spacing={1}>
			<Typography variant="h5" gutterBottom>
				Categories
			</Typography>

			{categories.map((category) => {
				return (
					<Stack key={category.label} direction="row" alignItems="center">
						<Box sx={{ width: 6, height: 6, mr: 2, bgcolor: 'primary.main', borderRadius: '50%' }} />

						<Link variant="body2" href={category.path} color="inherit">
							{category.label}
						</Link>
					</Stack>
				);
			})}
		</Stack>
	);
};

export default BlogSidebarCategories;
