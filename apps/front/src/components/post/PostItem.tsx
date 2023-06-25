import { Chip, Box, Card, CardContent, CardMedia, Link, Typography, useTheme } from '@mui/material';
import NextLink from 'next/link';

type Props = {
	title: string;
	summary: string;
};

const PostItem = ({ title, summary }: Props) => {
	const theme = useTheme();

	return (
		<Card
			sx={{
				borderRadius: 'unset',
				display: 'flex',
				'&:hover .MuiCardMedia-root': {
					transform: 'scale(1.1)',
				},
				'& .MuiCardMedia-root': {
					transition: 'all .5s',
				},
				'&:hover .post-anchor-title': {
					backgroundSize: '100% 2px',
				},
				'& .post-anchor-title': {
					backgroundImage: 'linear-gradient(90deg, currentColor 0, currentColor)',
					backgroundPosition: '0 95%',
					backgroundRepeat: 'no-repeat',
					backgroundSize: '0 2px',
					transition: 'all .5s',
				},
			}}
			elevation={0}
		>
			<Link
				href="/"
				component={NextLink}
				marginRight="30px"
				// display="inline-block"
				// overflow="hidden"
				// width="285px"
				// height="285px"
			>
				<Box
					component="span"
					width="285px"
					height="285px"
					display="inline-block"
					overflow="hidden"
					// sx={{
					// 	'&:hover .MuiCardMedia-root': {
					// 		transform: 'scale(1.1)',
					// 	},
					// 	'& .MuiCardMedia-root': {
					// 		transition: 'all .5s',
					// 	},
					// }}
				>
					<CardMedia
						component="img"
						image="https://new.axilthemes.com/demo/react/papr/images/posts/post_1.jpg?imwidth=640"
						// title="green iguana"
						width="inherit"
						height="inherit"
					/>
				</Box>
			</Link>
			<CardContent sx={{ padding: 'unset' }}>
				<Chip
					label="Category"
					size="small"
					sx={{
						bgcolor: 'red',
						textTransform: 'uppercase',
						borderRadius: 'unset',
						// fontSize: '1.1rem',
						fontWeight: '600',
						marginBottom: '28px',
					}}
				/>
				<Typography
					variant="h5"
					padding=".2% 0"
					fontSize="20px"
					fontWeight="600"
					lineHeight="30px"
					marginBottom="15px"
					gutterBottom
				>
					<Link
						href="/"
						component={NextLink}
						display="inline"
						color={theme.palette.black}
						className="post-anchor-title"
						sx={{
							textDecoration: 'none',
							// backgroundImage: 'linear-gradient(90deg, currentColor 0, currentColor)',
							// backgroundPosition: '0 95%',
							// backgroundRepeat: 'no-repeat',
							// backgroundSize: '0 2px',
							// '&:hover': {
							// 	backgroundSize: '100% 2px',
							// },
							// transition: 'all .5s',
						}}
					>
						{title}
					</Link>
				</Typography>
				<Typography variant="body2" color="text.secondary">
					{/* Lizards are a widespread group of squamate reptiles, with over 6,000 species, ranging across all continents
					except Antarctica */}
					{/* Curabitur egestas est vitae sem blandit tincidunt. Nunc cursus interdum odio sit amet gravida. */}
					{summary}
				</Typography>
			</CardContent>
			{/* <CardActions>
				<Button size="small">Share</Button>
				<Button size="small">Learn More</Button>
			</CardActions> */}
		</Card>
	);
};

export default PostItem;
