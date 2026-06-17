import { radioClasses } from '@mui/material/Radio';
import type { Components, Theme } from '@mui/material/styles';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import SvgIcon from '@mui/material/SvgIcon';

// ----------------------------------------------------------------------

/**
 * Icons
 */
const RadioIcon = (props: SvgIconProps) => (
	<SvgIcon {...props}>
		<path
			d="M12 2C13.9778 2 15.91 2.59 17.56 3.6853C19.2002 4.78 20.48 6.35 21.24 8.17317C21.9957 10 22.19 12.01 21.81 13.9509C21.422 15.89 20.47 17.67 19.07 19.0711C17.6725 20.47 15.89 21.42 13.95 21.8079C12.0111 22.19 10 22 8.17 21.2388C6.3459 20.48 4.78 19.2 3.69 17.5557C2.58649 15.91 2 13.98 2 12C2 6.48 6.48 2 12 2ZM12 3.5C9.74566 3.5 7.58 4.4 5.99 5.98959C4.39553 7.58 3.5 9.75 3.5 12C3.5 14.25 4.4 16.42 5.99 18.0104C7.58365 19.6 9.75 20.5 12 20.5C14.2543 20.5 16.42 19.6 18.01 18.0104C19.6045 16.42 20.5 14.25 20.5 12C20.5 9.75 19.6 7.58 18.01 5.98959C16.4163 4.4 14.25 3.5 12 3.5Z"
			fill="currentColor"
		/>
	</SvgIcon>
);

const RadioCheckedIcon = (props: SvgIconProps) => (
	<SvgIcon {...props}>
		<path
			fillRule="evenodd"
			clipRule="evenodd"
			d="M12 2C6.477 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.523 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 8C10.9391 8 9.92 8.42 9.17 9.17157C8.42143 9.92 8 10.94 8 12C8 13.06 8.42 14.08 9.17 14.8284C9.92172 15.58 10.94 16 12 16C13.0609 16 14.08 15.58 14.83 14.8284C15.5786 14.08 16 13.06 16 12C16 10.94 15.58 9.92 14.83 9.17157C14.0783 8.42 13.06 8 12 8Z"
			fill="currentColor"
		/>
	</SvgIcon>
);

// ----------------------------------------------------------------------

const MuiRadio: Components<Theme>['MuiRadio'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		size: 'small',
		icon: <RadioIcon />,
		checkedIcon: <RadioCheckedIcon />,
	},

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ ownerState, theme }) => ({
			padding: theme.spacing(1),
			borderRadius: '50%',
			transition: 'background-color 150ms ease-in-out',
			'&:hover': {
				backgroundColor: 'transparent',
			},
			'&.Mui-focusVisible': {
				outline: `2px solid ${theme.vars.palette.primary.main}`,
				outlineOffset: '2px',
			},
			...(ownerState.color === 'default' && {
				[`&.${radioClasses.checked}`]: {
					color: theme.vars.palette.text.primary,
				},
			}),
			[`&.${radioClasses.disabled}`]: {
				color: theme.vars.palette.action.disabled,
			},
		}),
	},
};

// ----------------------------------------------------------------------

export const radio = { MuiRadio };
