import Fab, { type FabProps } from '@mui/material/Fab';
import { useBackToTop } from 'minimal-shared/hooks';
import { cloneElement } from 'react';

import { Iconify } from '../iconify/iconify';

// ----------------------------------------------------------------------

type BackToTopProps = FabProps & {
	isDebounce?: boolean;
	scrollThreshold?: string | number;
	renderButton?: (isVisible?: boolean) => React.ReactElement;
};

export const BackToTopButton = ({
	sx,
	isDebounce,
	renderButton,
	scrollThreshold = '90%',
	...other
}: BackToTopProps) => {
	const { onBackToTop, isVisible } = useBackToTop(scrollThreshold, isDebounce);

	if (renderButton) {
		return cloneElement(
			renderButton(isVisible) as React.ReactElement<{ onClick?: () => void }>,
			{
				onClick: onBackToTop,
			},
		);
	}

	return (
		<Fab
			aria-label="Back to top"
			onClick={onBackToTop}
			sx={[
				(theme) => {
					return {
						width: 48,
						height: 48,
						position: 'fixed',
						transform: 'scale(0)',
						right: { xs: 24, md: 32 },
						bottom: { xs: 24, md: 32 },
						zIndex: theme.zIndex.speedDial,
						transition: theme.transitions.create(['transform']),
						...(isVisible && { transform: 'scale(1)' }),
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<Iconify width={24} icon="solar:double-alt-arrow-up-bold-duotone" />
		</Fab>
	);
};
