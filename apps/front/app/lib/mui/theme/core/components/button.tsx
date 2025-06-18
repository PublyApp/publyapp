import { buttonClasses, type ButtonProps } from '@mui/material/Button';
import type {
	Components,
	ComponentsVariants,
	CSSObject,
	Theme,
} from '@mui/material/styles';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

/**
 * TypeScript (type definition and extension)
 * @to {@link file://./../../extend-theme-types.d.ts}
 */

export type ButtonExtendVariant = {
	soft: true;
};

// ----------------------------------------------------------------------

const COLORS = [
	'primary',
	'secondary',
	'info',
	'success',
	'warning',
	'error',
] as const;

type PaletteColor = (typeof COLORS)[number];

// ----------------------------------------------------------------------

const styleColors = (
	ownerState: ButtonProps,
	styles: (val: PaletteColor) => CSSObject,
) => {
	const outputStyle = COLORS.reduce((acc, color) => {
		if (!ownerState.disabled && ownerState.color === color) {
			// biome-ignore lint/style/noParameterAssign: code from template leave as is for now
			acc = styles(color);
		}

		return acc;
	}, {});

	return outputStyle;
};

// ----------------------------------------------------------------------

const MuiButtonBase: Components<Theme>['MuiButtonBase'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return { fontFamily: theme.typography.fontFamily };
		},
	},
};

// ----------------------------------------------------------------------

const softVariant: Record<string, ComponentsVariants<Theme>['MuiButton']> = {
	colors: COLORS.map((color) => {
		return {
			props: ({ ownerState }) => {
				return (
					!ownerState.disabled &&
					ownerState.variant === 'soft' &&
					ownerState.color === color
				);
			},
			style: ({ theme }) => {
				return {
					color: theme.vars.palette[color].dark,
					backgroundColor: varAlpha(
						theme.vars.palette[color].mainChannel,
						0.16,
					),
					'&:hover': {
						backgroundColor: varAlpha(
							theme.vars.palette[color].mainChannel,
							0.32,
						),
					},
					...theme.applyStyles('dark', {
						color: theme.vars.palette[color].light,
					}),
				};
			},
		};
	}),
	base: [
		{
			props: ({ ownerState }) => {
				return ownerState.variant === 'soft';
			},
			style: ({ theme }) => {
				return {
					backgroundColor: varAlpha(
						theme.vars.palette.grey['500Channel'],
						0.08,
					),
					'&:hover': {
						backgroundColor: varAlpha(
							theme.vars.palette.grey['500Channel'],
							0.24,
						),
					},
					[`&.${buttonClasses.disabled}`]: {
						backgroundColor: theme.vars.palette.action.disabledBackground,
					},
				};
			},
		},
	],
};

const MuiButton: Components<Theme>['MuiButton'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { color: 'inherit', disableElevation: true },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: { variants: [softVariant.base, softVariant.colors].flat() as never },
		/**
		 * @variant contained
		 */
		contained: ({ theme, ownerState }) => {
			const styled = {
				colors: styleColors(ownerState, (color) => {
					return {
						'&:hover': { boxShadow: theme.vars.customShadows[color] },
					};
				}),
				inheritColor: {
					...(ownerState.color === 'inherit' &&
						!ownerState.disabled && {
							color: theme.vars.palette.common.white,
							backgroundColor: theme.vars.palette.grey[800],
							'&:hover': {
								boxShadow: theme.vars.customShadows.z8,
								backgroundColor: theme.vars.palette.grey[700],
							},
							...theme.applyStyles('dark', {
								color: theme.vars.palette.grey[800],
								backgroundColor: theme.vars.palette.common.white,
								'&:hover': { backgroundColor: theme.vars.palette.grey[400] },
							}),
						}),
				},
			};
			return { ...styled.inheritColor, ...styled.colors };
		},
		/**
		 * @variant outlined
		 */
		outlined: ({ theme, ownerState }) => {
			const styled = {
				colors: styleColors(ownerState, (color) => {
					return {
						borderColor: varAlpha(theme.vars.palette[color].mainChannel, 0.48),
					};
				}),
				inheritColor: {
					...(ownerState.color === 'inherit' &&
						!ownerState.disabled && {
							borderColor: varAlpha(
								theme.vars.palette.grey['500Channel'],
								0.32,
							),
							'&:hover': { backgroundColor: theme.vars.palette.action.hover },
						}),
				},
				base: {
					'&:hover': {
						borderColor: 'currentColor',
						boxShadow: '0 0 0 0.75px currentColor',
					},
				},
			};
			return { ...styled.base, ...styled.inheritColor, ...styled.colors };
		},
		/**
		 * @variant text
		 */
		text: ({ ownerState, theme }) => {
			const styled = {
				inheritColor: {
					...(ownerState.color === 'inherit' &&
						!ownerState.disabled && {
							'&:hover': { backgroundColor: theme.vars.palette.action.hover },
						}),
				},
			};
			return { ...styled.inheritColor };
		},
		/**
		 * @sizes
		 */
		sizeSmall: ({ ownerState }) => {
			return {
				height: 30,
				...(ownerState.variant === 'text'
					? { paddingLeft: '4px', paddingRight: '4px' }
					: { paddingLeft: '8px', paddingRight: '8px' }),
			};
		},
		sizeMedium: ({ ownerState }) => {
			return {
				...(ownerState.variant === 'text'
					? { paddingLeft: '8px', paddingRight: '8px' }
					: { paddingLeft: '12px', paddingRight: '12px' }),
			};
		},
		sizeLarge: ({ ownerState }) => {
			return {
				height: 48,
				...(ownerState.variant === 'text'
					? { paddingLeft: '10px', paddingRight: '10px' }
					: { paddingLeft: '16px', paddingRight: '16px' }),
			};
		},
	},
};

// ----------------------------------------------------------------------

export const button = { MuiButtonBase, MuiButton };
