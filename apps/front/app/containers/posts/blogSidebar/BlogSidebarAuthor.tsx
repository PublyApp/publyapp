import { Avatar, IconButton, Stack, Typography } from '@mui/material';

import Iconify from '@devist/ui-react/components/Iconify';
import type { IAuthorProps } from '@devist/ui-react/types/author';

import { _socials } from '@/front/_mock';

// ----------------------------------------------------------------------

type Props = {
	author: IAuthorProps;
};

const BlogSidebarAuthor = ({ author }: Props) => {
	const { name, role, picture } = author;

	return (
		<Stack spacing={2} direction="row" sx={{ mb: { md: 5 } }}>
			<Avatar src={picture} sx={{ width: 64, height: 64 }} />

			<Stack>
				<Typography variant="h5">{name}</Typography>

				<Typography variant="body2" sx={{ mt: 0.5, mb: 2, color: 'text.secondary' }}>
					{role}
				</Typography>

				<Stack direction="row">
					{_socials.map((social) => {
						return (
							<IconButton key={social.value}>
								<Iconify icon={social.icon} sx={{ color: social.color }} />
							</IconButton>
						);
					})}
				</Stack>
			</Stack>
		</Stack>
	);
};

export default BlogSidebarAuthor;
