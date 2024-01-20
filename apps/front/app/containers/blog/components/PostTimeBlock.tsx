import { Box, Stack, type StackProps } from '@mui/material';

import { fDate } from '@devist/ui-react/utils/date.utils';

// ----------------------------------------------------------------------

interface Props extends StackProps {
	createdAt: string;
	duration?: string;
}

const PostTimeBlock = ({ createdAt, duration, sx, ...other }: Props) => {
	return (
		<Stack
			flexWrap="wrap"
			direction="row"
			alignItems="center"
			sx={{ typography: 'caption', color: 'text.disabled', ...sx }}
			{...other}
		>
			{fDate(createdAt)}

			{duration && (
				<>
					<Box
						component="span"
						sx={{
							mx: 1,
							width: 4,
							height: 4,
							borderRadius: '50%',
							backgroundColor: 'currentColor',
						}}
					/>

					{duration}
				</>
			)}
		</Stack>
	);
};

export default PostTimeBlock;
