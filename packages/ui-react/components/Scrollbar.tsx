import { forwardRef, memo } from 'react';

import { alpha, Box, styled, type SxProps, type Theme } from '@mui/material';
import SimpleBar, { type Props as SimplebarProps } from 'simplebar-react';

export interface ScrollbarProps extends SimplebarProps {
	children?: React.ReactNode;
	sx?: SxProps<Theme>;
}

const Scrollbar = forwardRef<HTMLDivElement, ScrollbarProps>(({ children, sx, ...other }, ref) => {
	const userAgent = typeof navigator === 'undefined' ? 'SSR' : navigator.userAgent;

	const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

	if (isMobile) {
		return (
			<Box ref={ref} sx={{ overflow: 'auto', ...sx }} {...other}>
				{children}
			</Box>
		);
	}

	return (
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		<StyledRootScrollbar>
			{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
			<StyledScrollbar
				scrollableNodeProps={{
					ref,
				}}
				clickOnTrack={false}
				sx={sx}
				{...other}
			>
				{children}
			</StyledScrollbar>
		</StyledRootScrollbar>
	);
});

export default memo(Scrollbar);

// ----------------------------------------------------------------------

export const StyledRootScrollbar = styled('div')(() => {
	return {
		flexGrow: 1,
		height: '100%',
		overflow: 'hidden',
	};
});

export const StyledScrollbar = styled(SimpleBar)(({ theme }) => {
	return {
		maxHeight: '100%',
		'& .simplebar-scrollbar': {
			'&:before': {
				backgroundColor: alpha(theme.palette.grey[600], 0.48),
			},
			'&.simplebar-visible:before': {
				opacity: 1,
			},
		},
		'& .simplebar-mask': {
			zIndex: 'inherit',
		},
	};
});
