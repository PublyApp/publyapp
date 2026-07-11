import { IconChevronDown, IconLogout } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarImage } from '~/components/ui/avatar';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { useLogout } from '~/lib/hooks/use-logout';
import { toCurrentUser, useCurrentUserQuery } from '~/lib/query/auth';

export const AppShellUserMenu = () => {
	const { t } = useTranslation('common');
	const { data } = useCurrentUserQuery();
	const currentUser = toCurrentUser(data);
	const { logout, isLoggingOut } = useLogout();

	const displayName = currentUser?.displayName || t('un-named');
	const avatarSeed = currentUser?.displayName || currentUser?.email || '?';

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
