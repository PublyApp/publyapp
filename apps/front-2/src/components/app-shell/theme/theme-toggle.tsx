import { Button } from '@heroui/react';

import {
	type ColorScheme,
	useUiStore,
	setColorScheme,
} from '../../../lib/store/ui-store';

export const THEME_TOGGLE_TEST_ID = 'theme-toggle';

export const ThemeToggle = () => {
	const savedTheme = useUiStore((state) => state.colorScheme);

	const onToggle = () => {
		const nextTheme: ColorScheme = savedTheme === 'light' ? 'dark' : 'light';
		setColorScheme(nextTheme);
	};

	const label = savedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
	const iconLabel = savedTheme === 'dark' ? '☀︎' : '🌙';
	const ariaPressed = savedTheme === 'dark';

	return (
		<Button
			data-testid={THEME_TOGGLE_TEST_ID}
			variant="solid"
			color="primary"
			isIconOnly
			aria-label={label}
			aria-pressed={ariaPressed}
			onPress={onToggle}
		>
			{iconLabel}
		</Button>
	);
};
