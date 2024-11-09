import { alpha, Avatar, Box, Container, ListItemText, Stack, Typography, useTheme } from '@mui/material';

import type { DateType } from '@/shared/types/date.types';
// import { useResponsive } from 'src/hooks/use-responsive';
import { bgGradient } from '@/ui-react/utils/css.utils';
import { fDate } from '@/ui-react/utils/date.utils';

// import type { IPostHero } from 'src/types/blog';
// import { fDate } from 'src/utils/format-time';

// import { _socials } from 'src/_mock';
// import Iconify from '@/ui-react/components/Iconify';

// ----------------------------------------------------------------------
export type IPostHero = {
	title: string;
	coverUrl: string;
	createdAt?: DateType;
	author?: {
		name: string;
		avatarUrl: string;
	};
};

const PostDetailsHero = ({ title, author, coverUrl, createdAt }: IPostHero) => {
	const theme = useTheme();

	// const smUp = useResponsive('up', 'sm');

	return (
		<Box
			sx={{
				height: 480,
				overflow: 'hidden',
				...bgGradient({
					imgUrl: coverUrl,
					startColor: `${alpha(theme.palette.grey[900], 0.64)} 0%`,
					endColor: `${alpha(theme.palette.grey[900], 0.64)} 100%`,
				}),
			}}
		>
			<Container sx={{ height: 1, position: 'relative' }}>
				<Typography
					variant="h3"
					component="h1"
					sx={{
						zIndex: 9,
						color: 'common.white',
						position: 'absolute',
						maxWidth: 480,
						pt: { xs: 2, md: 8 },
					}}
				>
					{title}
				</Typography>

				<Stack
					sx={{
						left: 0,
						width: 1,
						bottom: 0,
						position: 'absolute',
					}}
				>
					{author && createdAt && (
						<Stack
							direction="row"
							alignItems="center"
							sx={{
								px: { xs: 2, md: 3 },
								pb: { xs: 3, md: 8 },
							}}
						>
							<Avatar alt={author.name} src={author.avatarUrl} sx={{ width: 64, height: 64, mr: 2 }} />

							<ListItemText
								sx={{ color: 'common.white' }}
								primary={author.name}
								secondary={fDate(createdAt)}
								primaryTypographyProps={{ typography: 'subtitle1', mb: 0.5 }}
								secondaryTypographyProps={{
									color: 'inherit',
									sx: { opacity: 0.64 },
								}}
							/>
						</Stack>
					)}

					{/* <SpeedDial
						direction={smUp ? 'left' : 'up'}
						ariaLabel="Share post"
						icon={<Iconify icon="solar:share-bold" />}
						FabProps={{ size: 'medium' }}
						sx={{
							position: 'absolute',
							bottom: { xs: 32, md: 64 },
							right: { xs: 16, md: 24 },
						}}
					>
						{_socials.map((action) => {
							return (
								<SpeedDialAction
									key={action.name}
									icon={<Iconify icon={action.icon} sx={{ color: action.color }} />}
									tooltipTitle={action.name}
									tooltipPlacement="top"
									FabProps={{ color: 'default' }}
								/>
							);
						})}
					</SpeedDial> */}
				</Stack>
			</Container>
		</Box>
	);
};

export default PostDetailsHero;
