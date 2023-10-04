// @mui
import { menuItemClasses } from '@mui/material/MenuItem';
import Popover, { type PopoverOrigin, type PopoverProps } from '@mui/material/Popover';
import { alpha, styled } from '@mui/material/styles';

import { bgBlur } from '@ui-react/utils/cssUtils';

// ----------------------------------------------------------------------
export type MenuPopoverArrowValue =
	| 'top-left'
	| 'top-center'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-center'
	| 'bottom-right'
	| 'left-top'
	| 'left-center'
	| 'left-bottom'
	| 'right-top'
	| 'right-center'
	| 'right-bottom';

export interface MenuPopoverProps extends Omit<PopoverProps, 'open'> {
	open: HTMLElement | null;
	arrow?: MenuPopoverArrowValue;
	hiddenArrow?: boolean;
}

const CustomPopover = ({ open, children, arrow = 'top-right', hiddenArrow, sx, ...other }: MenuPopoverProps) => {
	// eslint-disable-next-line @typescript-eslint/no-use-before-define
	const { style, anchorOrigin, transformOrigin } = getPosition(arrow);

	return (
		<Popover
			open={Boolean(open)}
			anchorEl={open}
			anchorOrigin={anchorOrigin as PopoverOrigin}
			transformOrigin={transformOrigin as PopoverOrigin}
			slotProps={{
				paper: {
					sx: {
						width: 'auto',
						overflow: 'inherit',
						...style,
						[`& .${menuItemClasses.root}`]: {
							'& svg': {
								mr: 2,
								flexShrink: 0,
							},
						},
						...sx,
					},
				},
			}}
			{...other}
		>
			{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
			{!hiddenArrow && <StyledArrow arrow={arrow} />}

			{children}
		</Popover>
	);
};

export default CustomPopover;

// ----------------------------------------------------------------------

export const StyledArrow = styled('span')<{ arrow: MenuPopoverArrowValue }>(({ arrow, theme }) => {
	const SIZE = 14;

	const POSITION = -(SIZE / 2) + 0.5;

	const topStyle = {
		top: POSITION,
		transform: 'rotate(135deg)',
	};

	const bottomStyle = {
		bottom: POSITION,
		transform: 'rotate(-45deg)',
	};

	const leftStyle = {
		left: POSITION,
		transform: 'rotate(45deg)',
	};

	const rightStyle = {
		right: POSITION,
		transform: 'rotate(-135deg)',
	};

	return {
		width: SIZE,
		height: SIZE,
		position: 'absolute',
		borderBottomLeftRadius: SIZE / 4,
		clipPath: 'polygon(0% 0%, 100% 100%, 0% 100%)',
		border: `solid 1px ${alpha(
			theme.palette.mode === 'light' ? theme.palette.grey[500] : theme.palette.common.black,
			0.12,
		)}`,
		...bgBlur({
			color: theme.palette.background.paper,
		}),
		// Top
		...(arrow === 'top-left' && { ...topStyle, left: 20 }),
		...(arrow === 'top-center' && {
			...topStyle,
			left: 0,
			right: 0,
			margin: 'auto',
		}),
		...(arrow === 'top-right' && { ...topStyle, right: 20 }),
		// Bottom
		...(arrow === 'bottom-left' && { ...bottomStyle, left: 20 }),
		...(arrow === 'bottom-center' && {
			...bottomStyle,
			left: 0,
			right: 0,
			margin: 'auto',
		}),
		...(arrow === 'bottom-right' && { ...bottomStyle, right: 20 }),
		// Left
		...(arrow === 'left-top' && { ...leftStyle, top: 20 }),
		...(arrow === 'left-center' && {
			...leftStyle,
			top: 0,
			bottom: 0,
			margin: 'auto',
		}),
		...(arrow === 'left-bottom' && { ...leftStyle, bottom: 20 }),
		// Right
		...(arrow === 'right-top' && { ...rightStyle, top: 20 }),
		...(arrow === 'right-center' && {
			...rightStyle,
			top: 0,
			bottom: 0,
			margin: 'auto',
		}),
		...(arrow === 'right-bottom' && { ...rightStyle, bottom: 20 }),
	};
});

// ----------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components
export function getPosition(arrow: string) {
	let props;

	switch (arrow) {
		case 'top-left':
			props = {
				style: { ml: -0.75 },
				anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
				transformOrigin: { vertical: 'top', horizontal: 'left' },
			};
			break;
		case 'top-center':
			props = {
				style: {},
				anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
				transformOrigin: { vertical: 'top', horizontal: 'center' },
			};
			break;
		case 'top-right':
			props = {
				style: { ml: 0.75 },
				anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
				transformOrigin: { vertical: 'top', horizontal: 'right' },
			};
			break;
		case 'bottom-left':
			props = {
				style: { ml: -0.75 },
				anchorOrigin: { vertical: 'top', horizontal: 'left' },
				transformOrigin: { vertical: 'bottom', horizontal: 'left' },
			};
			break;
		case 'bottom-center':
			props = {
				style: {},
				anchorOrigin: { vertical: 'top', horizontal: 'center' },
				transformOrigin: { vertical: 'bottom', horizontal: 'center' },
			};
			break;
		case 'bottom-right':
			props = {
				style: { ml: 0.75 },
				anchorOrigin: { vertical: 'top', horizontal: 'right' },
				transformOrigin: { vertical: 'bottom', horizontal: 'right' },
			};
			break;
		case 'left-top':
			props = {
				style: { mt: -0.75 },
				anchorOrigin: { vertical: 'top', horizontal: 'right' },
				transformOrigin: { vertical: 'top', horizontal: 'left' },
			};
			break;
		case 'left-center':
			props = {
				anchorOrigin: { vertical: 'center', horizontal: 'right' },
				transformOrigin: { vertical: 'center', horizontal: 'left' },
			};
			break;
		case 'left-bottom':
			props = {
				style: { mt: 0.75 },
				anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
				transformOrigin: { vertical: 'bottom', horizontal: 'left' },
			};
			break;
		case 'right-top':
			props = {
				style: { mt: -0.75 },
				anchorOrigin: { vertical: 'top', horizontal: 'left' },
				transformOrigin: { vertical: 'top', horizontal: 'right' },
			};
			break;
		case 'right-center':
			props = {
				anchorOrigin: { vertical: 'center', horizontal: 'left' },
				transformOrigin: { vertical: 'center', horizontal: 'right' },
			};
			break;
		case 'right-bottom':
			props = {
				style: { mt: 0.75 },
				anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
				transformOrigin: { vertical: 'bottom', horizontal: 'right' },
			};
			break;

		// top-right
		default:
			props = {
				style: { ml: 0.75 },
				anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
				transformOrigin: { vertical: 'top', horizontal: 'right' },
			};
	}

	return props;
}
