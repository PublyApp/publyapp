import { Button, Card, CardActions, CardContent, CardMedia, Typography } from '@mui/material';

type Props = {
	image: string;
	title: string;
	description: string;
};

const MediaCard = ({ image, title, description }: Props) => {
	return (
		<Card sx={{ maxWidth: 345 }}>
			<CardMedia sx={{ height: 140 }} image={image} /* title="green iguana" */ />
			<CardContent>
				<Typography gutterBottom variant="h5" component="div">
					{title}
				</Typography>
				<Typography variant="body2" color="text.secondary">
					{description}
				</Typography>
			</CardContent>
			<CardActions>
				<Button size="small">Learn more</Button>
				<Button size="small">Share</Button>
			</CardActions>
		</Card>
	);
};

export default MediaCard;
