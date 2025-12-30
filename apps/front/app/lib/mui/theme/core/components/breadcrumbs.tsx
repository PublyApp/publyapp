import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { Theme, Components } from '@mui/material/styles';

import SvgIcon from '@mui/material/SvgIcon';

// ----------------------------------------------------------------------

/**
 * Icons
 */
const SeparatorIcon = (props: SvgIconProps) => (
	<SvgIcon {...props}>
		<path
			fill="currentColor"
			fillRule="evenodd"
			d="M8.512 4.43a.75.75 0 0 1 1.057.082l6 7a.75.75 0 0 1 0 .976l-6 7a.75.75 0 0 1-1.138-.976L14.012 12L8.431 5.488a.75.75 0 0 1 .08-1.057"
			clipRule="evenodd"
		/>
	</SvgIcon>
);

// ----------------------------------------------------------------------

const MuiBreadcrumbs: Components<Theme>['MuiBreadcrumbs'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		separator: <SeparatorIcon sx={{ width: 16, height: 16 }} />,
	},
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		ol: ({ theme }) => ({
			rowGap: theme.spacing(0.5),
			columnGap: theme.spacing(1),
			alignItems: 'center',
		}),
		li: ({ theme }) => ({
			display: 'inline-flex',
			alignItems: 'center',
			'& > *': {
				...theme.typography.body2,
			},
			'& a': {
				color: theme.vars.palette.text.secondary,
				textDecoration: 'none',
				transition: 'color 150ms ease-in-out',
				'&:hover': {
					color: theme.vars.palette.text.primary,
				},
			},
			'&:last-of-type': {
				color: theme.vars.palette.text.primary,
				fontWeight: theme.typography.fontWeightMedium,
			},
		}),
		separator: ({ theme }) => ({
			margin: 0,
			color: theme.vars.palette.text.disabled,
		}),
	},
};

// ----------------------------------------------------------------------

export const breadcrumbs = { MuiBreadcrumbs };
