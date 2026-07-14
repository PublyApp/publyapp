import { IconMoon, IconSun } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';

import {
	useUiStore,
	withThemeTransitionSuppressed,
} from '../../../lib/store/ui-store';

export const THEME_TOGGLE_TEST_ID = 'theme-toggle';

export const ThemeToggle = ({ className }: { className?: string }) => {
	const { t } = useTranslation('common');
	const colorScheme = useUiStore((state) => state.colorScheme);
	const toggleColorScheme = useUiStore((state) => state.toggleColorScheme);
	const isDarkMode = colorScheme === 'dark';
	const label = isDarkMode
		? t('switch-to-light-mode')
		: t('switch-to-dark-mode');
	const Icon = isDarkMode ? IconSun : IconMoon;
	const ariaPressed = isDarkMode;

	const handleClick = () => {
		withThemeTransitionSuppressed(toggleColorScheme);
	};

	return (
		<Button
			data-testid={THEME_TOGGLE_TEST_ID}
			variant="outline"
			size="icon"
			className={className}
			aria-label={label}
			aria-pressed={ariaPressed}
			onClick={handleClick}
		>
			<Icon aria-hidden="true" className="size-4" />
		</Button>
	);
};
