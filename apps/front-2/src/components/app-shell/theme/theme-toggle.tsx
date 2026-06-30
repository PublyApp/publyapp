import { Button } from '@heroui/react';

import { useUiStore } from '../../../lib/store/ui-store';

export const THEME_TOGGLE_TEST_ID = 'theme-toggle';

export const ThemeToggle = () => {
	const { colorScheme, toggleColorScheme } = useUiStore((state) => ({
		colorScheme: state.colorScheme,
		toggleColorScheme: state.toggleColorScheme,
	}));
	const isDarkMode = colorScheme === 'dark';
	const label = isDarkMode ? 'Switch to light mode' : 'Switch to dark mode';
	const iconLabel = isDarkMode ? '☀︎' : '🌙';
	const ariaPressed = isDarkMode;

	return (
		<Button
			data-testid={THEME_TOGGLE_TEST_ID}
			variant="outline"
			isIconOnly
			aria-label={label}
			aria-pressed={ariaPressed}
			onPress={toggleColorScheme}
		>
			{iconLabel}
		</Button>
	);
};
