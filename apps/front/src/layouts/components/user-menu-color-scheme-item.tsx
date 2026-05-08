import { type SupportedColorScheme, useColorScheme } from '@mui/material';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import get from 'lodash/get';
import map from 'lodash/map';
import { usePopover } from 'minimal-shared/hooks';

import { CustomPopover } from '#app/components/custom-popover/custom-popover.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useSettingsContext } from '#app/hooks/use-settings-context.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

// ----------------------------------------------------------------------

const colorSchemeConfigs = {
	light: { icon: 'solar:sun-bold-duotone', tKey: 'light-mode' },
	dark: { icon: 'solar:moon-bold-duotone', tKey: 'dark-mode' },
	system: { icon: 'solar:monitor-bold-duotone', tKey: 'system-mode' },
};

export const ColorSchemeMenuItem = () => {
	const { t } = useTranslate();
	const { open, anchorEl, onClose, onOpen } = usePopover();
	const settings = useSettingsContext();
	const { mode, systemMode, setMode, allColorSchemes } = useColorScheme();

	const resolvedMode = mode === 'system' ? (systemMode ?? 'dark') : mode;
	const activeKey = mode ?? resolvedMode;
	const activeIcon = get(
		colorSchemeConfigs,
		`${activeKey}.icon`,
		'solar:moon-bold-duotone',
	) as string;
	const activeLabel = t(
		get(colorSchemeConfigs, `${activeKey}.tKey`, activeKey) as never,
	);

	const handleChangeColorScheme = (colorScheme: SupportedColorScheme) => {
		setMode(colorScheme);
		settings.setState({ colorScheme });
		onClose();
	};

	return (
		<>
			<MenuItem
				onClick={onOpen}
				sx={{
					gap: 1,
					py: 0.5,
					px: 1.5,
					minHeight: 32,
				}}
			>
				<Iconify width={18} icon={activeIcon as never} />
				<Typography variant="body2" sx={{ fontSize: '0.8125rem', flex: 1 }}>
					{t('theme')}
				</Typography>
				<Typography
					variant="caption"
					sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
				>
					{activeLabel}
				</Typography>
				<Iconify
					width={16}
					icon="eva:arrow-ios-forward-fill"
					sx={{ color: 'text.disabled' }}
				/>
			</MenuItem>

			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={{
					arrow: { placement: 'left-top', hide: true },
					paper: { sx: { ml: 0.5 } },
				}}
			>
				<MenuList sx={{ width: 160 }}>
					{map(allColorSchemes, (option) => {
						const optionIcon = get(
							colorSchemeConfigs,
							`${option}.icon`,
							'solar:moon-bold-duotone',
						) as string;
						const optionLabel = t(
							get(colorSchemeConfigs, `${option}.tKey`, option) as never,
						);

						return (
							<MenuItem
								key={option}
								selected={option === activeKey}
								onClick={() => {
									handleChangeColorScheme(option);
								}}
							>
								<Iconify icon={optionIcon as never} />
								<Box component="span" sx={{ flex: 1 }}>
									{optionLabel}
								</Box>
							</MenuItem>
						);
					})}
				</MenuList>
			</CustomPopover>
		</>
	);
};
