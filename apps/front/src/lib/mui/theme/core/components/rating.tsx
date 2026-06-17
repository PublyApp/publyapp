import { ratingClasses } from '@mui/material/Rating';
import type { Components, Theme } from '@mui/material/styles';
import SvgIcon, {
	type SvgIconProps,
	svgIconClasses,
} from '@mui/material/SvgIcon';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

/**
 * Icons
 */
const RatingIcon = (props: SvgIconProps) => {
	return (
		<SvgIcon {...props}>
			<path d="M17.56,21 C17.4000767,21 17.24,20.96 17.1,20.89 L12,18.22 L6.9,20.89 C6.56213339,21.07 6.15,21.04 5.84,20.81 C5.53626201,20.59 5.38,20.21 5.45,19.83 L6.45,14.2 L2.33,10.2 C2.06805623,9.94 1.97,9.55 2.08,9.2 C2.19824414,8.84 2.51,8.57 2.89,8.52 L8.59,7.69 L11.1,2.56 C11.2670864,2.22 11.62,2 12,2 C12.3833226,2 12.73,2.22 12.9,2.56 L15.44,7.68 L21.14,8.51 C21.5175771,8.56 21.83,8.83 21.95,9.19 C22.0581156,9.54 21.96,9.93 21.7,10.19 L17.58,14.19 L18.58,19.82 C18.652893,20.2 18.5,20.59 18.18,20.82 C17.9989179,20.95 17.78,21.01 17.56,21 L17.56,21 Z" />
		</SvgIcon>
	);
};

// ----------------------------------------------------------------------

const MuiRating: Components<Theme>['MuiRating'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { emptyIcon: <RatingIcon />, icon: <RatingIcon /> },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: { [`&.${ratingClasses.disabled}`]: { opacity: 0.48 } },
		iconEmpty: ({ theme }) => {
			return { color: varAlpha(theme.vars.palette.grey['500Channel'], 0.48) };
		},
		sizeSmall: { [`& .${svgIconClasses.root}`]: { width: 20, height: 20 } },
		sizeMedium: { [`& .${svgIconClasses.root}`]: { width: 24, height: 24 } },
		sizeLarge: { [`& .${svgIconClasses.root}`]: { width: 28, height: 28 } },
	},
};

// ----------------------------------------------------------------------

export const rating = { MuiRating };
