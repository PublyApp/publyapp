import { Link, Stack } from '@mui/material';

import Image from '@devist/ui-react/components/Image';
import TextMaxLine from '@devist/ui-react/components/TextMaxLine';
import type { IBlogPostProps } from '@devist/ui-react/types/blog';
import { fDate } from '@devist/ui-react/utils/date.utils';

import PostTimeBlock from './PostTimeBlock';

// ----------------------------------------------------------------------

type Props = {
	post: IBlogPostProps;
	onSiderbar?: boolean;
};

const PostItemMobile = ({ post, onSiderbar }: Props) => {
	const { title, duration, coverImg, createdAt } = post;

	return (
		<Stack spacing={2} direction="row" alignItems={{ xs: 'flex-start', md: 'unset' }} sx={{ width: 1 }}>
			<Image
				alt={title}
				src={coverImg}
				sx={{
					width: 80,
					height: 80,
					flexShrink: 0,
					borderRadius: 1.5,
				}}
			/>

			<Stack spacing={onSiderbar ? 0.5 : 1}>
				<Link color="inherit" href="/">
					<TextMaxLine variant={onSiderbar ? 'subtitle2' : 'h6'}>{title}</TextMaxLine>
				</Link>

				<PostTimeBlock createdAt={fDate(createdAt)} duration={duration} />
			</Stack>
		</Stack>
	);
};

export default PostItemMobile;
