import { useEffect, useState } from 'react';

import GlobalStyles from '@mui/material/GlobalStyles';
import { useTheme } from '@mui/material/styles';
import NProgress from 'nprogress';

import usePathname from '@/office/hooks/usePathame';

// ----------------------------------------------------------------------

const ProgressBar = () => {
	const pathname = usePathname();

	const [mounted, setMounted] = useState(false);

	const [visible, setVisible] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!visible) {
			NProgress.start();
			setVisible(true);
		}

		if (visible) {
			NProgress.done();
			setVisible(false);
		}

		if (!visible && mounted) {
			setVisible(false);
			NProgress.done();
		}

		return () => {
			NProgress.done();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pathname, mounted]);

	if (!mounted) {
		return null;
	}

	// eslint-disable-next-line @typescript-eslint/no-use-before-define
	return <StyledProgressBar />;
};

export default ProgressBar;

// ----------------------------------------------------------------------

const StyledProgressBar = () => {
	const theme = useTheme();

	const inputGlobalStyles = (
		<GlobalStyles
			styles={{
				'#nprogress': {
					pointerEvents: 'none',
					'.bar': {
						top: 0,
						left: 0,
						height: 2.5,
						zIndex: 9999,
						width: '100%',
						position: 'fixed',
						backgroundColor: theme.palette.primary.main,
						boxShadow: `0 0 2px ${theme.palette.primary.main}`,
					},
					'.peg': {
						right: 0,
						opacity: 1,
						width: 100,
						height: '100%',
						display: 'block',
						position: 'absolute',
						transform: 'rotate(3deg) translate(0px, -4px)',
						boxShadow: `0 0 10px ${theme.palette.primary.main}, 0 0 5px ${theme.palette.primary.main}`,
					},
				},
			}}
		/>
	);

	return inputGlobalStyles;
};
