import { useColorScheme } from '@mui/material';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import { m } from 'framer-motion';

import {
	transitionTap,
	varHover,
	varTap,
} from '#app/components/animate/index.ts';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useSettingsContext } from '#app/hooks/use-settings-context.ts';

// ----------------------------------------------------------------------

// Marketing-surface color scheme toggle: clicking immediately flips
// light↔dark, no popover with light/dark/system options. The full
// three-way picker lives in the authed layout where users discover it
// in their settings; on marketing pages the toggle should feel like a
// switch, not a menu.
export const MarketingColorSchemeToggle = ({
	sx,
	...other
}: IconButtonProps) => {
	const settings = useSettingsContext();
	const { mode, systemMode, setMode } = useColorScheme();
	const resolvedMode = mode === 'system' ? (systemMode ?? 'dark') : mode;
	const nextMode = resolvedMode === 'dark' ? 'light' : 'dark';

	const handleToggle = () => {
		setMode(nextMode);
		settings.setState({ colorScheme: nextMode });
	};

	return (
		<IconButton
			component={m.button}
			whileTap={varTap(0.96)}
			whileHover={varHover(1.04)}
			transition={transitionTap()}
			aria-label={`Switch to ${nextMode} mode`}
			onClick={handleToggle}
			sx={[{ p: 0, width: 40, height: 40 }, ...(Array.isArray(sx) ? sx : [sx])]}
			{...other}
		>
			<Iconify
				icon={
					resolvedMode === 'dark'
						? 'solar:sun-bold-duotone'
						: 'solar:moon-bold-duotone'
				}
			/>
		</IconButton>
	);
};
