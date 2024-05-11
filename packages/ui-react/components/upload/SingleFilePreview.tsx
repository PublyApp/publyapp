import { Box } from '@mui/material';

//
// import Image from '../image/Image.old.bak';

import Image from '../image/Image';

// ----------------------------------------------------------------------

type Props = {
	imgUrl?: string;
};

const SingleFilePreview = ({ imgUrl = '' }: Props) => {
	return (
		<Box
			sx={{
				p: 1,
				top: 0,
				left: 0,
				width: 1,
				height: 1,
				position: 'absolute',
			}}
		>
			<Image
				alt="file preview"
				src={imgUrl}
				sx={{
					width: 1,
					height: 1,
					borderRadius: 1,
				}}
			/>
		</Box>
	);
};

export default SingleFilePreview;
