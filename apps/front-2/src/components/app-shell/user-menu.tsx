import { IconChevronDown, IconLanguage, IconLogout } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarImage } from '~/components/ui/avatar';
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
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { useLogout } from '~/lib/hooks/use-logout';
import { useSwitchLocale } from '~/lib/hooks/use-switch-locale';
import {
	isSupportedLanguage,
	LOCALE_LABELS,
	SUPPORTED_LANGUAGES,
} from '~/lib/i18n.shared';
import { toCurrentUser, useCurrentUserQuery } from '~/lib/query/auth';

export const AppShellUserMenu = () => {
	const { t, i18n } = useTranslation('common');
	const { data } = useCurrentUserQuery();
	const currentUser = toCurrentUser(data);
	const { logout, isLoggingOut } = useLogout();
	const { switchLocale, isSwitching } = useSwitchLocale();

	const displayName = currentUser?.displayName || t('un-named');
	const avatarSeed = currentUser?.displayName || currentUser?.email || '?';
	const currentLocale = isSupportedLanguage(i18n.resolvedLanguage)
		? i18n.resolvedLanguage
		: SUPPORTED_LANGUAGES[0];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="app-shell-user-chip"
				data-testid="app-shell-user-menu-trigger"
			>
				{currentUser?.avatarUrl ? (
					<Avatar size="sm" className="size-7">
						<AvatarImage src={currentUser.avatarUrl} alt="" />
					</Avatar>
				) : (
					<InitialsAvatar name={avatarSeed} />
				)}
				<span className="app-shell-user-name">{displayName}</span>
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
