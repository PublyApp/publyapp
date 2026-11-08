import {
	IconChevronDown,
	IconLanguage,
	IconLogout,
	IconMoon,
	IconSun,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import QueryDisplay from '~/components/query-display';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { useLogout } from '~/lib/hooks/use-logout';
import { useSwitchLocale } from '~/lib/hooks/use-switch-locale';
import { toCurrentUser, useCurrentUserQuery } from '~/lib/query/auth';
import type { CurrentUser } from '~/lib/query/auth';
import {
	useUiStore,
	withThemeTransitionSuppressed,
} from '~/lib/store/ui-store';

import {
	isSupportedLanguage,
	LOCALE_LABELS,
	SUPPORTED_LANGUAGES,
} from '@org/shared-ts/lib/i18n/shared';

export const AppShellUserMenu = () => {
	const { t, i18n } = useTranslation('common');
	const userQuery = useCurrentUserQuery();
	const currentUser = toCurrentUser(userQuery.data);
	const { logout, isLoggingOut } = useLogout();
	const { switchLocale, isSwitching } = useSwitchLocale();
	const colorScheme = useUiStore((state) => state.colorScheme);
	const toggleColorScheme = useUiStore((state) => state.toggleColorScheme);
	const isDarkMode = colorScheme === 'dark';

	const displayName = currentUser?.displayName || t('un-named');
	// WCAG 2.5.3: the visible name must be part of the accessible name at
	// desktop. At <=639px the name is hidden, where the plain label is enough.
	const accountMenuLabel = currentUser?.displayName
		? t('account-menu-with-name', { name: displayName })
		: t('account-menu');
	const currentLocale = isSupportedLanguage(i18n.resolvedLanguage)
		? i18n.resolvedLanguage
		: SUPPORTED_LANGUAGES[0];

	// Today's chip renders the same placeholder before the current user
	// resolves, so the pending state is that exact chip (no visible change).
	const renderChip = (user: CurrentUser | null) => (
		<>
			<PersonAvatar
				name={user?.displayName || user?.email || '?'}
				avatarUrl={user?.avatarUrl}
				size="sm"
				className="size-7"
			/>
			<span className="app-shell-user-name">
				{user?.displayName || t('un-named')}
			</span>
		</>
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="app-shell-user-chip"
				aria-label={accountMenuLabel}
				data-testid="app-shell-user-menu-trigger"
			>
				<QueryDisplay
					query={userQuery}
					variant="discreet"
					LoadingSlot={renderChip(currentUser)}
					ErrorSlot={renderChip(currentUser)}
					EmptySlot={renderChip(currentUser)}
				>
					{({ data }) => renderChip(toCurrentUser(data))}
				</QueryDisplay>
				<IconChevronDown aria-hidden="true" className="size-4" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				sideOffset={8}
				data-testid="app-shell-user-menu"
			>
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						<span className="block truncate text-foreground">
							{displayName}
						</span>
						{currentUser?.email ? (
							<span className="block truncate text-muted-foreground">
								{currentUser.email}
							</span>
						) : null}
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuSub>
					<DropdownMenuSubTrigger data-testid="app-shell-user-menu-language">
						<IconLanguage />
						{t('language')}
					</DropdownMenuSubTrigger>
					<DropdownMenuPortal>
						<DropdownMenuSubContent>
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
										data-testid={`app-shell-user-menu-language-${locale}`}
									>
										{LOCALE_LABELS[locale]}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuSubContent>
					</DropdownMenuPortal>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => withThemeTransitionSuppressed(toggleColorScheme)}
					data-testid="app-shell-user-menu-theme"
				>
					{isDarkMode ? <IconSun /> : <IconMoon />}
					{isDarkMode ? t('switch-to-light-mode') : t('switch-to-dark-mode')}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					disabled={isLoggingOut}
					onClick={() => logout()}
					data-testid="app-shell-user-menu-logout"
				>
					<IconLogout />
					{t('log-out')}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
