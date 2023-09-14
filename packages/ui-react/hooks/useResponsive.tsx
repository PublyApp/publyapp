import { Breakpoint, useMediaQuery, useTheme } from '@mui/material';

type ReturnType = boolean;

type Query = 'up' | 'down' | 'between' | 'only';

type Value = Breakpoint | number;

export default function useResponsive(query: Query, start?: Value, end?: Value): ReturnType {
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
}
