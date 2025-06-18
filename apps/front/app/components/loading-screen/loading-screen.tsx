import { Fragment } from 'react';

import LinearProgress from '@mui/material/LinearProgress';
import Portal from '@mui/material/Portal';
import { styled, type SxProps, type Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export type LoadingScreenProps = React.ComponentProps<'div'> & {
	portal?: boolean;
	sx?: SxProps<Theme>;
};

export const LoadingScreen = ({ portal, sx, ...other }: LoadingScreenProps) => {
	const PortalWrapper = portal ? Portal : Fragment;

	return (
		<PortalWrapper>
			<LoadingContent sx={sx} {...other}>
				<LinearProgress color="inherit" sx={{ width: 1, maxWidth: 360 }} />
			</LoadingContent>
		</PortalWrapper>
	);
};

// ----------------------------------------------------------------------

const LoadingContent = styled('div')(({ theme }) => {
	return {
		flexGrow: 1,
		width: '100%',
		display: 'flex',
		minHeight: '100%',
		alignItems: 'center',
		justifyContent: 'center',
		paddingLeft: theme.spacing(5),
		paddingRight: theme.spacing(5),
	};
});
