import { type SupportedColorScheme, useColorScheme } from '@mui/material';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import { usePopover } from 'minimal-shared/hooks';
import { useId } from 'react';

import { CustomPopover } from '#app/components/custom-popover/custom-popover.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useSettingsContext } from '#app/hooks/use-settings-context.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

// ----------------------------------------------------------------------

// `enableSystemMode: false` in `theme-config.ts`, so MUI surfaces only
// `light` / `dark` through `useColorScheme().allColorSchemes`. If we ever
// turn system mode on, add a `system` entry here, expand the settings
// sanitizer in `settings-sync-state.client.ts`, and update the bridge.
type LightDark = 'light' | 'dark';

const colorSchemeConfigs = {
	light: {
		icon: 'solar:sun-bold-duotone',
		shortTKey: 'light',
		longTKey: 'light-mode',
	},
	dark: {
		icon: 'solar:moon-bold-duotone',
		shortTKey: 'dark',
		longTKey: 'dark-mode',
	},
} as const satisfies Record<
	LightDark,
	{
		icon: string;
		shortTKey: 'light' | 'dark';
		longTKey: 'light-mode' | 'dark-mode';
	}
>;

const isLightDark = (value: unknown): value is LightDark => {
	return value === 'light' || value === 'dark';
};

export const ColorSchemeMenuItem = () => {
	const { t } = useTranslate();
	const { open, anchorEl, onClose, onOpen } = usePopover();
	const settings = useSettingsContext();
	const { mode, systemMode, setMode, allColorSchemes } = useColorScheme();
	const submenuId = useId();

	// `mode` can be 'system' if external code set it, even with system mode
	// disabled in config. Resolve to the effective light/dark value.
	const resolvedMode = mode === 'system' ? (systemMode ?? 'dark') : mode;
	const activeKey: LightDark = isLightDark(resolvedMode)
		? resolvedMode
		: 'light';
	const activeConfig = colorSchemeConfigs[activeKey];

	const handleChangeColorScheme = (colorScheme: SupportedColorScheme) => {
		setMode(colorScheme);
		settings.setState({ colorScheme });
		onClose();
	};

	return (
		<>
			<MenuItem
				onClick={onOpen}
				aria-haspopup="menu"
				aria-expanded={open ? 'true' : undefined}
				aria-controls={open ? submenuId : undefined}
				sx={{
					'&.MuiMenuItem-root': { gap: 1 },
					py: 0.5,
					px: 1.5,
					minHeight: 32,
				}}
			>
				<Iconify width={18} icon={activeConfig.icon} />
				<Typography variant="body2" sx={{ fontSize: '0.8125rem', flex: 1 }}>
					{t('theme')}
				</Typography>
				<Box
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: 0.75,
						color: 'text.secondary',
					}}
				>
					<Typography
						variant="caption"
						sx={{ color: 'inherit', fontSize: '0.75rem' }}
					>
						{t(activeConfig.shortTKey)}
					</Typography>
					<Box
						component="kbd"
						aria-label="Keyboard shortcut Control J"
						sx={{
							px: 0.5,
							py: 0.125,
							fontFamily: 'inherit',
							fontSize: '0.7rem',
							lineHeight: 1.4,
							color: 'text.disabled',
							borderRadius: 0.75,
							border: '1px solid',
							borderColor: 'divider',
						}}
					>
						⌘J
					</Box>
				</Box>
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
				<MenuList id={submenuId} autoFocusItem={open} sx={{ width: 160 }}>
					{allColorSchemes.map((option) => {
						if (!isLightDark(option)) {
							return null;
						}
						const optionConfig = colorSchemeConfigs[option];
						const isSelected = option === activeKey;

						return (
							<MenuItem
								key={option}
								selected={isSelected}
								autoFocus={isSelected}
								onClick={() => {
									handleChangeColorScheme(option);
								}}
							>
								<Iconify icon={optionConfig.icon} />
								<Box component="span" sx={{ flex: 1 }}>
									{t(optionConfig.longTKey)}
								</Box>
							</MenuItem>
						);
					})}
				</MenuList>
			</CustomPopover>
		</>
	);
};
