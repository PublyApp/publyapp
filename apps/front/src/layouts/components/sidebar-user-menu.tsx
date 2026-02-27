import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { usePopover } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';
import { CustomPopover } from '@/front/components/custom-popover';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { useTenantParam } from '@/front/hooks/use-tenant-param';
import { logout } from '@/front/lib/cookies';

// ----------------------------------------------------------------------

export type SidebarUserMenuProps = {
	user?: {
		firstName?: string | null;
		lastName?: string | null;
		email: string;
		photoURL: string;
	};
	isCollapsed?: boolean;
	sx?: SxProps<Theme>;
};

const getMenuItems = (tenantId: string) => {
	const paths =
		tenantId === 'staff'
			? FRONT_PATH_NAMES.staff.account
			: FRONT_PATH_NAMES.tenant(tenantId).account;

	return [
		{
			label: 'Profile',
			icon: 'solar:user-circle-bold-duotone' as string,
			href: paths.root,
		},
		{
			label: 'Security',
			icon: 'solar:shield-keyhole-bold-duotone' as string,
			href: paths.security,
		},
		{
			label: 'Notifications',
			icon: 'solar:bell-bold-duotone' as string,
			href: paths.notifications,
		},
	];
};

export const SidebarUserMenu = ({
	user,
	isCollapsed = false,
	sx,
}: SidebarUserMenuProps) => {
	const { t } = useTranslation();
	const { open, anchorEl, onClose, onOpen } = usePopover();
	const tenantId = useTenantParam();

	const displayName = useMemo(() => {
		const fullName = getUserFullName(user);
		return fullName || t('un-named');
	}, [user, t]);

	const handleLogout = useCallback(() => {
		onClose();
		logout();
	}, [onClose]);

	const renderButton = () => {
		if (isCollapsed) {
			return (
				<ButtonBase
					onClick={onOpen}
					sx={[
						(theme) => ({
							width: 36,
							height: 36,
							borderRadius: `${theme.shape.borderRadius}px`,
							mx: 'auto',
							'&:hover': {
								bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
							},
							...(open && {
								bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
							}),
						}),
						...(Array.isArray(sx) ? sx : [sx]),
					]}
				>
					<Avatar sx={{ width: 32, height: 32, bgcolor: 'background.neutral' }}>
						<Iconify
							width={24}
							icon="solar:user-rounded-bold"
							sx={{ color: 'text.disabled' }}
						/>
					</Avatar>
				</ButtonBase>
			);
		}

		return (
			<ButtonBase
				onClick={onOpen}
				sx={[
					(theme) => ({
						width: 1,
						py: 0.75,
						px: 1,
						gap: 1,
						borderRadius: `${theme.shape.borderRadius}px`,
						textAlign: 'left',
						justifyContent: 'flex-start',
						'&:hover': {
							bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
						},
						...(open && {
							bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
						}),
					}),
					...(Array.isArray(sx) ? sx : [sx]),
				]}
			>
				<Avatar sx={{ width: 32, height: 32, bgcolor: 'background.neutral' }}>
					<Iconify
						width={24}
						icon="solar:user-rounded-bold"
						sx={{ color: 'text.disabled' }}
					/>
				</Avatar>

				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography
						noWrap
						variant="body2"
						sx={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.2 }}
					>
						{displayName}
					</Typography>
					<Typography
						noWrap
						variant="caption"
						sx={{
							color: 'text.secondary',
							fontSize: '0.7rem',
							lineHeight: 1.2,
						}}
					>
						{user?.email}
					</Typography>
				</Box>

				<Iconify
					width={18}
					icon="eva:more-vertical-fill"
					sx={{ color: 'text.disabled', flexShrink: 0 }}
				/>
			</ButtonBase>
		);
	};

	const menuItems = useMemo(() => getMenuItems(tenantId), [tenantId]);

	const renderMenuList = () => {
		return (
			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={{
					paper: {
						sx: {
							width: 200,
							ml: isCollapsed ? 1.1 : 0,
							mt: isCollapsed ? 0 : -1,
						},
					},
				}}
				anchorOrigin={
					isCollapsed
						? { vertical: 'bottom', horizontal: 'right' }
						: { vertical: 'top', horizontal: 'left' }
				}
				transformOrigin={
					isCollapsed
						? { vertical: 'bottom', horizontal: 'left' }
						: { vertical: 'bottom', horizontal: 'left' }
				}
			>
				{/* User info header */}
				<Box sx={{ px: 1.5, py: 1 }}>
					<Typography variant="subtitle2" noWrap sx={{ fontSize: '0.8125rem' }}>
						{displayName}
					</Typography>
					<Typography variant="caption" sx={{ color: 'text.disabled' }} noWrap>
						{user?.email}
					</Typography>
				</Box>

				<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

				<MenuList sx={{ py: 0.5 }}>
					{menuItems.map((item) => (
						<MenuItem key={item.label} sx={{ p: 0 }}>
							<Link
								component={RouterLink}
								href={item.href}
								color="inherit"
								underline="none"
								onClick={onClose}
								sx={{
									gap: 1,
									py: 0.5,
									px: 1.5,
									width: 1,
									minHeight: 32,
									display: 'flex',
									alignItems: 'center',
								}}
							>
								<Iconify width={18} icon={item.icon as never} />
								<Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
									{item.label}
								</Typography>
							</Link>
						</MenuItem>
					))}
				</MenuList>

				<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

				<MenuList sx={{ py: 0.5 }}>
					<MenuItem
						onClick={handleLogout}
						sx={{
							gap: 1,
							py: 0.5,
							minHeight: 32,
							color: 'error.main',
						}}
					>
						<Iconify width={18} icon="solar:logout-2-bold-duotone" />
						<Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
							{t('log-out')}
						</Typography>
					</MenuItem>
				</MenuList>
			</CustomPopover>
		);
	};

	return (
		<>
			{renderButton()}
			{renderMenuList()}
		</>
	);
};
