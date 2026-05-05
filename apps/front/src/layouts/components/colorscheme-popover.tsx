import { type SupportedColorScheme, useColorScheme } from '@mui/material';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import { m } from 'framer-motion';
import get from 'lodash/get';
import map from 'lodash/map';
import { usePopover } from 'minimal-shared/hooks';

import {
	transitionTap,
	varHover,
	varTap,
} from '#app/components/animate/index.ts';
import { CustomPopover } from '#app/components/custom-popover/index.ts';
import type { CustomPopoverProps } from '#app/components/custom-popover/types.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useSettingsContext } from '#app/hooks/use-settings-context.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

// ----------------------------------------------------------------------

const colorSchemeConfigs = {
	light: {
		icon: <Iconify icon="solar:sun-bold-duotone" />,
		t_key: 'light-mode',
	},
	dark: {
		icon: <Iconify icon="solar:moon-bold-duotone" />,
		t_key: 'dark-mode',
	},
};

export type ColorSchemePopoverProps = IconButtonProps & {
	popoverSlotProps?: CustomPopoverProps['slotProps'];
};

export const ColorSchemePopover = ({
	popoverSlotProps,
	sx,
	...other
}: ColorSchemePopoverProps) => {
	const { t } = useTranslate();
	const { open, anchorEl, onClose, onOpen } = usePopover();
	const settings = useSettingsContext();
	const { mode, systemMode, setMode, allColorSchemes } = useColorScheme();
	const resolvedMode = mode === 'system' ? (systemMode ?? 'dark') : mode;

	const handleChangeColorScheme = (colorScheme: SupportedColorScheme) => {
		setMode(colorScheme);
		settings.setState({
			colorScheme,
		});
	};

	return (
		<>
			<IconButton
				component={m.button}
				whileTap={varTap(0.96)}
				whileHover={varHover(1.04)}
				transition={transitionTap()}
				aria-label="Color scheme button"
				onClick={onOpen}
				sx={[
					(theme) => {
						return {
							p: 0,
							width: 40,
							height: 40,
							...(open && { bgcolor: theme.vars.palette.action.selected }),
						};
					},
					...(Array.isArray(sx) ? sx : [sx]),
				]}
				{...other}
			>
				{get(
					colorSchemeConfigs,
					`${resolvedMode}.icon`,
					<Iconify icon="solar:moon-bold-duotone" />,
				)}
			</IconButton>

			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={popoverSlotProps}
			>
				<MenuList sx={{ width: 160 }}>
					{map(allColorSchemes, (option) => {
						return (
							<MenuItem
								key={option}
								selected={option === resolvedMode}
								onClick={() => {
									handleChangeColorScheme(option);
									onClose();
								}}
							>
								{get(
									colorSchemeConfigs,
									`${option}.icon`,
									<Iconify icon="solar:moon-bold-duotone" />,
								)}
								{t(get(colorSchemeConfigs, `${option}.t_key`, option) as never)}
							</MenuItem>
						);
					})}
				</MenuList>
			</CustomPopover>
		</>
	);
};
