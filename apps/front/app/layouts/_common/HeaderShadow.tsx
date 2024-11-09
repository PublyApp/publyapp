import { Box, type BoxProps } from '@mui/material';

// ----------------------------------------------------------------------

const HeaderShadow = ({ sx, ...other }: BoxProps) => {
	return (
		<Box
			sx={{
				left: 0,
				right: 0,
				bottom: 0,
				height: 24,
				zIndex: -1,
				m: 'auto',
				borderRadius: '50%',
				position: 'absolute',
				width: 'calc(100% - 48px)',
				boxShadow: (theme) => {
					return theme.customShadows.z8;
				},
				...sx,
			}}
			{...other}
		/>
	);
};

export default HeaderShadow;
