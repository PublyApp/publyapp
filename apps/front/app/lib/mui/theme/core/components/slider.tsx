import { sliderClasses } from "@mui/material/Slider";
import type { Components, Theme } from "@mui/material/styles";
import { varAlpha } from "minimal-shared/utils";

// ----------------------------------------------------------------------

/**
 * TypeScript (type definition and extension)
 * @to {@link file://./../../extend-theme-types.d.ts}
 */

export type SliderExtendColor = {
	inherit: true;
};

// ----------------------------------------------------------------------

const SIZE = {
	rail: { small: 6, medium: 10 },
	thumb: { small: 16, medium: 20 },
	mark: { small: 4, medium: 6 },
};

const MuiSlider: Components<Theme>["MuiSlider"] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { size: "small" },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return {
				variants: [
					/** @color inherit */
					{
						props: ({ ownerState }) => {
							return ownerState.color === "inherit";
						},
						style: () => {
							return {
								[`& .${sliderClasses.markActive}`]: {
									...theme.applyStyles("dark", {
										backgroundColor: varAlpha(
											theme.vars.palette.grey["800Channel"],
											0.48,
										),
									}),
								},
							};
						},
					},
					/** @state disabled */
					{
						props: ({ ownerState }) => {
							return !!ownerState.disabled;
						},
						style: () => {
							return {
								[`&.${sliderClasses.disabled}`]: {
									color: varAlpha(
										theme.vars.palette.grey["500Channel"],
										theme.vars.palette.action.disabledOpacity,
									),
								},
							};
						},
					},
				],
				[`& .${sliderClasses.thumb}`]: {
					borderWidth: 1,
					borderStyle: "solid",
					width: SIZE.thumb.medium,
					height: SIZE.thumb.medium,
					boxShadow: theme.vars.customShadows.z1,
					color: theme.vars.palette.common.white,
					borderColor: varAlpha(theme.vars.palette.grey["500Channel"], 0.08),
					"&::before": {
						opacity: 0.4,
						boxShadow: "none",
						width: "calc(100% - 4px)",
						height: "calc(100% - 4px)",
						backgroundImage: `linear-gradient(180deg, ${theme.vars.palette.grey[500]}, transparent)`,
						...theme.applyStyles("dark", {
							opacity: 0.8,
						}),
					},
				},
			};
		},
		rail: ({ theme }) => {
			return {
				opacity: 0.12,
				height: SIZE.rail.medium,
				backgroundColor: theme.vars.palette.grey[500],
			};
		},
		track: { height: SIZE.rail.medium },
		mark: ({ style, theme }) => {
			return {
				width: 1,
				height: SIZE.mark.medium,
				backgroundColor: varAlpha(theme.vars.palette.grey["500Channel"], 0.48),
				// start mark
				'&[data-index="0"]': { display: "none" },
				// end mark
				...(style?.left === "100%" && { display: "none" }),
			};
		},
		markActive: ({ theme }) => {
			return {
				backgroundColor: varAlpha(theme.vars.palette.common.whiteChannel, 0.64),
			};
		},
		markLabel: ({ theme }) => {
			return {
				fontSize: theme.typography.pxToRem(13),
				color: theme.vars.palette.text.disabled,
			};
		},
		valueLabel: ({ theme }) => {
			return {
				borderRadius: 8,
				backgroundColor: theme.vars.palette.grey[800],
				...theme.applyStyles("dark", {
					backgroundColor: theme.vars.palette.grey[700],
				}),
			};
		},
		sizeSmall: {
			[`& .${sliderClasses.thumb}`]: {
				width: SIZE.thumb.small,
				height: SIZE.thumb.small,
			},
			[`& .${sliderClasses.rail}`]: { height: SIZE.rail.small },
			[`& .${sliderClasses.track}`]: { height: SIZE.rail.small },
			[`& .${sliderClasses.mark}`]: { height: SIZE.mark.small },
		},
	},
};

// ----------------------------------------------------------------------

export const slider = { MuiSlider };
