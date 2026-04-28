import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import SvgIcon from '@mui/material/SvgIcon';
import { useColorScheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { hasKeys, varAlpha } from 'minimal-shared/utils';
import { useCallback } from 'react';

import { themeConfig } from '#app/lib/mui/theme/theme-config.ts';
import type { ThemeColorScheme } from '#app/lib/mui/theme/types.ts';
import { primaryColorPresets } from '#app/lib/mui/theme/with-settings/index.ts';

import { useSettingsContext } from '../../../hooks/use-settings-context';
import { Iconify } from '../../iconify/iconify';
import { Scrollbar } from '../../scrollbar';
import type {
	SettingsContextValue,
	SettingsDrawerProps,
	SettingsState,
} from '../types';
import { BaseOption } from './base-option';
import { FontFamilyOptions, FontSizeOptions } from './font-options';
import { FullScreenButton } from './fullscreen-button';
import { settingIcons } from './icons';
import { NavColorOptions, NavLayoutOptions } from './nav-layout-option';
import { PresetsOptions } from './presets-options';
import { LargeBlock, SmallBlock } from './styles';

// ----------------------------------------------------------------------

type ColorSchemeControls = ReturnType<typeof useColorScheme>;

type SettingsDrawerHeaderProps = {
	canReset: boolean;
	onCloseDrawer: () => void;
	onReset: () => void;
};

const SettingsDrawerHeader = ({
	canReset,
	onCloseDrawer,
	onReset,
}: SettingsDrawerHeaderProps) => {
	return (
		<Box
			sx={{
				py: 2,
				pr: 1,
				pl: 2.5,
				display: 'flex',
				alignItems: 'center',
			}}
		>
			<Typography variant="h6" sx={{ flexGrow: 1 }}>
				Settings
			</Typography>

			<FullScreenButton />

			<Tooltip title="Reset all">
				<IconButton onClick={onReset}>
					<Badge color="error" variant="dot" invisible={!canReset}>
						<Iconify icon="solar:restart-bold" />
					</Badge>
				</IconButton>
			</Tooltip>

			<Tooltip title="Close">
				<IconButton onClick={onCloseDrawer}>
					<Iconify icon="mingcute:close-line" />
				</IconButton>
			</Tooltip>
		</Box>
	);
};

type SettingsOptionsPanelProps = {
	defaultSettings: SettingsState;
	mode: ColorSchemeControls['mode'];
	setMode: ColorSchemeControls['setMode'];
	settings: SettingsContextValue;
};

const SettingsOptionsPanel = ({
	defaultSettings,
	mode,
	setMode,
	settings,
}: SettingsOptionsPanelProps) => {
	// Visible options by default settings
	const isFontFamilyVisible = hasKeys(defaultSettings, ['fontFamily']);
	const isCompactLayoutVisible = hasKeys(defaultSettings, ['compactLayout']);
	const isDirectionVisible = hasKeys(defaultSettings, ['direction']);
	const isColorSchemeVisible = hasKeys(defaultSettings, ['colorScheme']);
	const isContrastVisible = hasKeys(defaultSettings, ['contrast']);
	const isNavColorVisible = hasKeys(defaultSettings, ['navColor']);
	const isNavLayoutVisible = hasKeys(defaultSettings, ['navLayout']);
	const isPrimaryColorVisible = hasKeys(defaultSettings, ['primaryColor']);
	const isFontSizeVisible = hasKeys(defaultSettings, ['fontSize']);

	const renderMode = () => {
		return (
			<BaseOption
				label="Dark mode"
				selected={settings.state.colorScheme === 'dark'}
				icon={<SvgIcon>{settingIcons.moon}</SvgIcon>}
				onChangeOption={() => {
					setMode(mode === 'light' ? 'dark' : 'light');
					settings.setState({
						colorScheme: mode === 'light' ? 'dark' : 'light',
					});
				}}
			/>
		);
	};

	const renderContrast = () => {
		return (
			<BaseOption
				label="Contrast"
				selected={settings.state.contrast === 'hight'}
				icon={<SvgIcon>{settingIcons.contrast}</SvgIcon>}
				onChangeOption={() => {
					return settings.setState({
						contrast:
							settings.state.contrast === 'default' ? 'hight' : 'default',
					});
				}}
			/>
		);
	};

	const renderRtl = () => {
		return (
			<BaseOption
				label="Right to left"
				selected={settings.state.direction === 'rtl'}
				icon={<SvgIcon>{settingIcons.alignRight}</SvgIcon>}
				onChangeOption={() => {
					return settings.setState({
						direction: settings.state.direction === 'ltr' ? 'rtl' : 'ltr',
					});
				}}
			/>
		);
	};

	const renderCompact = () => {
		return (
			<BaseOption
				tooltip="Dashboard only and available at large resolutions > 1600px (xl)"
				label="Compact"
				selected={!!settings.state.compactLayout}
				icon={<SvgIcon>{settingIcons.autofitWidth}</SvgIcon>}
				onChangeOption={() => {
					return settings.setState({
						compactLayout: !settings.state.compactLayout,
					});
				}}
			/>
		);
	};

	const renderPresets = () => {
		return (
			<LargeBlock
				title="Presets"
				canReset={settings.state.primaryColor !== defaultSettings.primaryColor}
				onReset={() => {
					return settings.setState({
						primaryColor: defaultSettings.primaryColor,
					});
				}}
			>
				<PresetsOptions
					icon={
						<SvgIcon sx={{ width: 28, height: 28 }}>
							{settingIcons.siderbarDuotone}
						</SvgIcon>
					}
					options={
						Object.keys(primaryColorPresets).map((key) => {
							return {
								name: key,
								value: primaryColorPresets[key].main,
							};
						}) as { name: SettingsState['primaryColor']; value: string }[]
					}
					value={settings.state.primaryColor}
					onChangeOption={(newOption) => {
						return settings.setState({ primaryColor: newOption });
					}}
				/>
			</LargeBlock>
		);
	};

	const renderNav = () => {
		return (
			<LargeBlock title="Nav" tooltip="Dashboard only" sx={{ gap: 2.5 }}>
				{isNavLayoutVisible && (
					<SmallBlock
						label="Layout"
						canReset={settings.state.navLayout !== defaultSettings.navLayout}
						onReset={() => {
							return settings.setState({
								navLayout: defaultSettings.navLayout,
							});
						}}
					>
						<NavLayoutOptions
							value={settings.state.navLayout}
							onChangeOption={(newOption) => {
								return settings.setState({ navLayout: newOption });
							}}
							options={[
								{
									value: 'vertical',
									icon: (
										<SvgIcon sx={{ width: 1, height: 'auto' }}>
											{settingIcons.navVertical}
										</SvgIcon>
									),
								},
								{
									value: 'horizontal',
									icon: (
										<SvgIcon sx={{ width: 1, height: 'auto' }}>
											{settingIcons.navHorizontal}
										</SvgIcon>
									),
								},
								{
									value: 'mini',
									icon: (
										<SvgIcon sx={{ width: 1, height: 'auto' }}>
											{settingIcons.navMini}
										</SvgIcon>
									),
								},
							]}
						/>
					</SmallBlock>
				)}
				{isNavColorVisible && (
					<SmallBlock
						label="Color"
						canReset={settings.state.navColor !== defaultSettings.navColor}
						onReset={() => {
							return settings.setState({ navColor: defaultSettings.navColor });
						}}
					>
						<NavColorOptions
							value={settings.state.navColor}
							onChangeOption={(newOption) => {
								return settings.setState({ navColor: newOption });
							}}
							options={[
								{
									label: 'Integrate',
									value: 'integrate',
									icon: <SvgIcon>{settingIcons.sidebarOutline}</SvgIcon>,
								},
								{
									label: 'Apparent',
									value: 'apparent',
									icon: <SvgIcon>{settingIcons.sidebarFill}</SvgIcon>,
								},
							]}
						/>
					</SmallBlock>
				)}
			</LargeBlock>
		);
	};

	const renderFont = () => {
		return (
			<LargeBlock title="Font" sx={{ gap: 2.5 }}>
				{isFontFamilyVisible && (
					<SmallBlock
						label="Family"
						canReset={settings.state.fontFamily !== defaultSettings.fontFamily}
						onReset={() => {
							return settings.setState({
								fontFamily: defaultSettings.fontFamily,
							});
						}}
					>
						<FontFamilyOptions
							value={settings.state.fontFamily}
							onChangeOption={(newOption) => {
								return settings.setState({ fontFamily: newOption });
							}}
							options={[
								themeConfig.fontFamily.primary,
								'DM Sans Variable',
								'Nunito Sans Variable',
							]}
							icon={
								<SvgIcon sx={{ width: 28, height: 28 }}>
									{settingIcons.font}
								</SvgIcon>
							}
						/>
					</SmallBlock>
				)}
				{isFontSizeVisible && (
					<SmallBlock
						label="Size"
						canReset={settings.state.fontSize !== defaultSettings.fontSize}
						onReset={() => {
							return settings.setState({ fontSize: defaultSettings.fontSize });
						}}
						sx={{ gap: 5 }}
					>
						<FontSizeOptions
							options={[12, 20]}
							value={settings.state.fontSize}
							onChangeOption={(newOption) => {
								return settings.setState({ fontSize: newOption });
							}}
						/>
					</SmallBlock>
				)}
			</LargeBlock>
		);
	};

	return (
		<Box
			sx={{
				pb: 5,
				gap: 6,
				px: 2.5,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<Box
				sx={{
					gap: 2,
					display: 'grid',
					gridTemplateColumns: 'repeat(2, 1fr)',
				}}
			>
				{isColorSchemeVisible && renderMode()}
				{isContrastVisible && renderContrast()}
				{isDirectionVisible && renderRtl()}
				{isCompactLayoutVisible && renderCompact()}
			</Box>

			{(isNavColorVisible || isNavLayoutVisible) && renderNav()}
			{isPrimaryColorVisible && renderPresets()}
			{(isFontFamilyVisible || isFontSizeVisible) && renderFont()}
		</Box>
	);
};

export const SettingsDrawer = ({
	sx,
	defaultSettings,
}: SettingsDrawerProps) => {
	const settings = useSettingsContext();

	const { mode, setMode } = useColorScheme();

	const handleReset = useCallback(() => {
		settings.onReset();
		setMode(defaultSettings.colorScheme as ThemeColorScheme);
	}, [defaultSettings.colorScheme, setMode, settings]);

	return (
		<Drawer
			anchor="right"
			open={settings.openDrawer}
			onClose={settings.onCloseDrawer}
			slotProps={{
				backdrop: { invisible: true },
				paper: {
					sx: [
						(theme) => {
							return {
								...theme.mixins.paperStyles(theme, {
									color: varAlpha(
										theme.vars.palette.background.defaultChannel,
										0.9,
									),
								}),
								width: 360,
							};
						},
						...(Array.isArray(sx) ? sx : [sx]),
					],
				},
			}}
		>
			<SettingsDrawerHeader
				canReset={settings.canReset}
				onCloseDrawer={settings.onCloseDrawer}
				onReset={handleReset}
			/>

			<Scrollbar>
				<SettingsOptionsPanel
					defaultSettings={defaultSettings}
					mode={mode}
					setMode={setMode}
					settings={settings}
				/>
			</Scrollbar>
		</Drawer>
	);
};
