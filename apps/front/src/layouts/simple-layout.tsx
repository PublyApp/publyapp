import { IconWorld } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import logoSvg from '~/assets/gray-ui/logo.svg';
import { ThemeToggle } from '~/components/app-shell/theme/theme-toggle';
import { buttonVariants } from '~/components/ui/button.variants';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { useSwitchLocale } from '~/lib/hooks/use-switch-locale';
import {
	isSupportedLanguage,
	LOCALE_LABELS,
	SUPPORTED_LANGUAGES,
} from '~/lib/i18n.shared';
import { cn } from '~/lib/utils';

type SimpleLayoutProps = {
	children: ReactNode;
};

/**
 * Deliberately NOT `.app-shell-topbar-action-btn` — that class is hidden by
 * the workspace topbar's `<640px` mobile rule (app.css), which this
 * standalone header must never be subject to (r3-shell-F1): it is the only
 * surface where a signed-in tenant user can switch locale before entering an
 * org, so hiding it on a phone leaves no locale control anywhere.
 */
const STANDALONE_TOPBAR_ACTION_BTN_CLASS =
	'h-9 w-9 rounded-full border-(--publy-border) text-(--publy-foreground-muted)';

const LanguageSwitchButton = () => {
	const { t, i18n } = useTranslation('common');
	const { switchLocale, isSwitching } = useSwitchLocale();
	const currentLocale = isSupportedLanguage(i18n.resolvedLanguage)
		? i18n.resolvedLanguage
		: SUPPORTED_LANGUAGES[0];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					buttonVariants({ variant: 'outline', size: 'icon' }),
					STANDALONE_TOPBAR_ACTION_BTN_CLASS,
				)}
				aria-label={t('language')}
				data-testid="tenant-portal-language-button"
			>
				<IconWorld aria-hidden="true" className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={8}>
				<DropdownMenuRadioGroup
					value={currentLocale}
					onValueChange={(value) => {
						if (isSwitching || value === currentLocale) {
							return;
						}
						if (isSupportedLanguage(value)) {
							switchLocale(value);
						}
					}}
				>
					{SUPPORTED_LANGUAGES.map((locale) => (
						<DropdownMenuRadioItem
							key={locale}
							value={locale}
							disabled={isSwitching}
							data-testid={`tenant-portal-language-${locale}`}
						>
							{LOCALE_LABELS[locale]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

/**
 * Slim standalone header (logo left; color-scheme + language icon buttons
 * right) with a centered content column — the post-login bridge surface
 * (P1 tenant picker), distinct from both the split-brand auth surface and
 * the full authed workspace shell.
 */
export const SimpleLayout = ({ children }: SimpleLayoutProps) => {
	return (
		<div
			className="flex min-h-svh flex-col bg-background"
			data-testid="simple-layout"
		>
			<header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 sm:h-[60px] sm:px-6">
				<img src={logoSvg} alt="PublyApp" className="size-7" />
				<div className="flex items-center gap-2">
					<ThemeToggle className={STANDALONE_TOPBAR_ACTION_BTN_CLASS} />
					<LanguageSwitchButton />
				</div>
			</header>
			<main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
				<div className="w-full max-w-[460px]">{children}</div>
			</main>
		</div>
	);
};

export default SimpleLayout;
