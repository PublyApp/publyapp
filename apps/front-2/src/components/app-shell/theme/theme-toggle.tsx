import { IconMoon, IconSun } from '@tabler/icons-react';
import { Button } from '~/components/ui/button';

import { useUiStore } from '../../../lib/store/ui-store';

export const THEME_TOGGLE_TEST_ID = 'theme-toggle';

export const ThemeToggle = () => {
	const { colorScheme, toggleColorScheme } = useUiStore((state) => ({
		colorScheme: state.colorScheme,
		toggleColorScheme: state.toggleColorScheme,
	}));
	const isDarkMode = colorScheme === 'dark';
	const label = isDarkMode ? 'Switch to light mode' : 'Switch to dark mode';
	const Icon = isDarkMode ? IconSun : IconMoon;
	const ariaPressed = isDarkMode;

	return (
		<Button
			data-testid={THEME_TOGGLE_TEST_ID}
			variant="outline"
			size="icon"
			aria-label={label}
			aria-pressed={ariaPressed}
			onClick={toggleColorScheme}
		>
			<Icon aria-hidden="true" className="size-4" />
		</Button>
	);
};
