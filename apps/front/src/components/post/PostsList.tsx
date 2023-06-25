import { Box, Container, Grid } from '@mui/material';

import PostItem from './PostItem';

const PostsList = () => {
	return (
		<Box mt="60px" mb="30px">
			<Container>
				<Grid container>
					<Grid item width={{ xs: '70%' }} bgcolor="red">
						<PostItem title="ldsodkfod jodfjrjoeg oiwejrfeowrjfe" summary="ldsodkfod jodfjrjoeg oiwejrfeowrjfe" />
					</Grid>
					<Grid item width={{ xs: '30%' }} bgcolor="blue">
						ko
					</Grid>
				</Grid>
			</Container>
		</Box>
	);
};

export default PostsList;
