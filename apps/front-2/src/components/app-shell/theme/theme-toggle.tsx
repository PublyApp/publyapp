import { Button } from '@heroui/react';

import { useUiStore } from '../../../lib/store/ui-store';

export const THEME_TOGGLE_TEST_ID = 'theme-toggle';

export const ThemeToggle = () => {
	const colorScheme = useUiStore((state) => state.colorScheme);
	const toggleColorScheme = useUiStore((state) => state.toggleColorScheme);
	const isDarkMode = colorScheme === 'dark';
	const label = isDarkMode ? 'Switch to light mode' : 'Switch to dark mode';
	const iconLabel = isDarkMode ? '☀︎' : '🌙';
	const ariaPressed = isDarkMode;

	return (
		<Button
			data-testid={THEME_TOGGLE_TEST_ID}
			variant="solid"
			color="primary"
			isIconOnly
			aria-label={label}
			aria-pressed={ariaPressed}
			onPress={toggleColorScheme}
		>
			{iconLabel}
		</Button>
	);
};
