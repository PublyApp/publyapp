import { Button } from '@heroui/react';
import { useEffect, useState } from 'react';

import {
	type ColorScheme,
	useUiStore,
	setColorScheme,
} from '../../../lib/store/ui-store';

export const THEME_TOGGLE_TEST_ID = 'theme-toggle';

export const ThemeToggle = () => {
	const [isHydrated, setIsHydrated] = useState(false);
	const savedTheme = useUiStore((state) => state.colorScheme);

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	const onToggle = () => {
		const nextTheme: ColorScheme = savedTheme === 'light' ? 'dark' : 'light';
		setColorScheme(nextTheme);
	};

	const displayedTheme: ColorScheme = isHydrated ? savedTheme : 'light';
	const label =
		displayedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
	const iconLabel = displayedTheme === 'dark' ? '☀︎' : '🌙';
	const ariaPressed = displayedTheme === 'dark';

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
