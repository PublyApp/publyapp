import {
	type ButtonGroupProps,
	buttonGroupClasses,
} from '@mui/material/ButtonGroup';
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

export type ButtonGroupExtendVariant = {
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
	ownerState: ButtonGroupProps,
	styles: (val: PaletteColor) => CSSObject,
) => {
	for (const color of COLORS) {
		if (!ownerState.disabled && ownerState.color === color) {
			return styles(color);
		}
	}

	return {};
};

const buttonClasses = `& .${buttonGroupClasses.firstButton}, & .${buttonGroupClasses.middleButton}`;

const softVariant: Record<string, ComponentsVariants<Theme>['MuiButtonGroup']> =
	{
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
						[buttonClasses]: {
							borderColor: varAlpha(
								theme.vars.palette[color].darkChannel,
								0.24,
							),
							...theme.applyStyles('dark', {
								borderColor: varAlpha(
									theme.vars.palette[color].lightChannel,
									0.24,
								),
							}),
						},
						[`&.${buttonGroupClasses.vertical}`]: {
							[buttonClasses]: {
								borderColor: varAlpha(
									theme.vars.palette[color].darkChannel,
									0.24,
								),
								...theme.applyStyles('dark', {
									borderColor: varAlpha(
										theme.vars.palette[color].lightChannel,
										0.24,
									),
								}),
							},
						},
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
						[buttonClasses]: {
							borderRight: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
							[`&.${buttonGroupClasses.disabled}`]: {
								borderColor: theme.vars.palette.action.disabledBackground,
							},
						},
						[`&.${buttonGroupClasses.vertical}`]: {
							[buttonClasses]: {
								borderRight: 'none',
								borderBottom: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
								[`&.${buttonGroupClasses.disabled}`]: {
									borderColor: theme.vars.palette.action.disabledBackground,
								},
							},
						},
					};
				},
			},
		],
	};

// ----------------------------------------------------------------------

const MuiButtonGroup: Components<Theme>['MuiButtonGroup'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { disableElevation: true },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: {
			variants: [
				/**
				 * @variant soft
				 */
				softVariant.base,
				softVariant.colors,
			].flat() as never,
		},
		/**
		 * @variant contained
		 */
		contained: ({ theme, ownerState }) => {
			const styled = {
				colors: styleColors(ownerState, (color) => {
					return {
						[buttonClasses]: {
							borderColor: varAlpha(
								theme.vars.palette[color].darkChannel,
								0.48,
							),
						},
					};
				}),
				inheritColor: {
					...(ownerState.color === 'inherit' && {
						[buttonClasses]: {
							borderColor: varAlpha(
								theme.vars.palette.grey['500Channel'],
								0.32,
							),
						},
					}),
				},
				disabled: {
					...(ownerState.disabled && {
						[buttonClasses]: {
							[`&.${buttonGroupClasses.disabled}`]: {
								borderColor: theme.vars.palette.action.disabledBackground,
							},
						},
					}),
				},
			};

			return { ...styled.inheritColor, ...styled.colors, ...styled.disabled };
		},
		/**
		 * @variant outlined
		 */
		outlined: ({ theme, ownerState }) => {
			const styled = {
				inheritColor: {
					...(ownerState.color === 'inherit' && {
						[`& .${buttonGroupClasses.grouped}`]: {
							'&:hover': { borderColor: theme.vars.palette.text.primary },
						},
					}),
				},
			};

			return { ...styled.inheritColor };
		},
		/**
		 * @variant text
		 */
		text: ({ theme, ownerState }) => {
			const styled = {
				colors: styleColors(ownerState, (color) => {
					return {
						[buttonClasses]: {
							borderColor: varAlpha(
								theme.vars.palette[color].mainChannel,
								0.48,
							),
						},
					};
				}),
				inheritColor: {
					...(ownerState.color === 'inherit' && {
						[buttonClasses]: {
							borderColor: varAlpha(
								theme.vars.palette.grey['500Channel'],
								0.32,
							),
						},
					}),
				},
				disabled: {
					...(ownerState.disabled && {
						[buttonClasses]: {
							[`&.${buttonGroupClasses.disabled}`]: {
								borderColor: theme.vars.palette.action.disabledBackground,
							},
						},
					}),
				},
			};

			return { ...styled.inheritColor, ...styled.colors, ...styled.disabled };
		},
	},
};

// ----------------------------------------------------------------------

export const buttonGroup = { MuiButtonGroup };
