import { useEffect } from 'react';
import { Button, useTheme } from '@heroui/react';

import {
	type ColorScheme,
	useUiStore,
	setColorScheme,
} from '../../../lib/store/ui-store';

export const THEME_TOGGLE_TEST_ID = 'theme-toggle';

export const ThemeToggle = () => {
	const { theme, setTheme } = useTheme();
	const savedTheme = useUiStore((state) => state.colorScheme);

	useEffect(() => {
		if (theme !== savedTheme) {
			setTheme(savedTheme);
		}
	}, [savedTheme, setTheme, theme]);

	const onToggle = () => {
		const nextTheme: ColorScheme = savedTheme === 'light' ? 'dark' : 'light';
		setTheme(nextTheme);
		setColorScheme(nextTheme);
	};

	const label = savedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
	const ariaPressed = savedTheme === 'dark';

	return (
		<Button
			data-testid={THEME_TOGGLE_TEST_ID}
			variant="solid"
			color="primary"
			aria-pressed={ariaPressed}
			onPress={onToggle}
		>
			{label}
		</Button>
	);
};
