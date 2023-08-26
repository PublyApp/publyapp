import { Button, CircularProgress, Container, Grid, Typography, useTheme } from '@mui/material';

import MediaCard from '@aktiveo/ui-react/components/MediaCard';
import { useGetInfiniteAITools } from '@aktiveo/ui-react/query/features/aiTools/aiTool.hooks';
import { pxToRem } from '@aktiveo/ui-react/utils/styles';

const Page = () => {
	const theme = useTheme();

	const {
		result: { data: aiToolsData, isFetching, fetchNextPage },
	} = useGetInfiniteAITools();

	return (
		<Container>
			<Typography variant="h1">List of AI Tools</Typography>
			<Grid container>
				{aiToolsData &&
					aiToolsData.pages.map((iResult) => {
						return iResult.aiTools.map((aiTool) => {
							return (
								<Grid key={aiTool.objectId} item xs={4} /* sx={{ width: }} */ mb={pxToRem(32)}>
									<MediaCard image={aiTool.image} description={aiTool.description} title={aiTool.name} />
								</Grid>
							);
						});
					})}
			</Grid>
			<Button
				variant="contained"
				onClick={() => {
					fetchNextPage();
				}}
			>
				{isFetching ? <CircularProgress sx={{ color: theme.palette.common.white }} /> : 'Load more'}
			</Button>
		</Container>
	);
};

export { Page };
