import { type SupportedColorScheme, useColorScheme } from '@mui/material';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import { m } from 'framer-motion';
import _ from 'lodash';
import { usePopover } from 'minimal-shared/hooks';
import { transitionTap, varHover, varTap } from '@/front/components/animate';
import { CustomPopover } from '@/front/components/custom-popover';
import { Iconify } from '@/front/components/iconify/iconify';
import { useSettingsContext } from '@/front/hooks/use-settings-context';

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

export type ColorSchemePopoverProps = IconButtonProps;

export const ColorSchemePopover = ({
	sx,
	...other
}: ColorSchemePopoverProps) => {
	const { open, anchorEl, onClose, onOpen } = usePopover();

	const settings = useSettingsContext();
	const { mode, setMode, allColorSchemes } = useColorScheme();

	const handleChangeColorScheme = (colorScheme: SupportedColorScheme) => {
		setMode(colorScheme);
		settings.setState({
			colorScheme,
		});
	};

	const renderMenuList = () => {
		return (
			<CustomPopover open={open} anchorEl={anchorEl} onClose={onClose}>
				<MenuList sx={{ width: 160, minHeight: 72 }}>
					{_.map(allColorSchemes, (option) => {
						return (
							<MenuItem
								key={option}
								selected={option === mode}
								onClick={() => {
									return handleChangeColorScheme(option);
								}}
							>
								{_.get(
									colorSchemeConfigs,
									`${option}.icon`,
									<Iconify icon="mingcute:close-line" />,
								)}
								{_.get(colorSchemeConfigs, `${option}.t_key`, option)}
							</MenuItem>
						);
					})}
				</MenuList>
			</CustomPopover>
		);
	};

	return (
		<>
			<IconButton
				component={m.button}
				whileTap={varTap(0.96)}
				whileHover={varHover(1.04)}
				transition={transitionTap()}
				aria-label="Languages button"
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
				{_.get(
					colorSchemeConfigs,
					`${mode}.icon`,
					<Iconify icon="mingcute:close-line" />,
				)}
			</IconButton>

			{renderMenuList()}
		</>
	);
};
