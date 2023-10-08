import { useMediaQuery, useTheme, type Breakpoint } from '@mui/material';

type Query = 'up' | 'down' | 'between' | 'only';

type Value = Breakpoint | number;

const useResponsive = (query: Query, start?: Value, end?: Value): boolean => {
	const theme = useTheme();

	switch (query) {
		case 'up': {
			const mediaUp = useMediaQuery(theme.breakpoints.up(start as Value));
			return mediaUp;
		}

		case 'down': {
			const mediaDown = useMediaQuery(theme.breakpoints.down(start as Value));
			return mediaDown;
		}

		case 'between': {
			const mediaBetween = useMediaQuery(theme.breakpoints.between(start as Value, end as Value));
			return mediaBetween;
		}

		case 'only': {
			const mediaOnly = useMediaQuery(theme.breakpoints.only(start as Breakpoint));
			return mediaOnly;
		}

		default:
			// eslint-disable-next-line quotes
			throw new Error("useResponsive 'query' argument is mandatory");
	}
};

export default useResponsive;
