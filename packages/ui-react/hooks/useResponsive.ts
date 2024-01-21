import { useMediaQuery, useTheme, type Breakpoint } from '@mui/material';

type Query = 'up' | 'down' | 'between' | 'only';

type Value = Breakpoint | number;

const useResponsive = (query: Query, start?: Value, end?: Value): boolean => {
	const theme = useTheme();

	const mediaUp = useMediaQuery(theme.breakpoints.up(start as Value));

	const mediaDown = useMediaQuery(theme.breakpoints.down(start as Value));

	const mediaBetween = useMediaQuery(theme.breakpoints.between(start as Value, end as Value));

	const mediaOnly = useMediaQuery(theme.breakpoints.only(start as Breakpoint));

	if (query === 'up') {
		return mediaUp;
	}

	if (query === 'down') {
		return mediaDown;
	}

	if (query === 'between') {
		return mediaBetween;
	}

	return mediaOnly;
};

export default useResponsive;
