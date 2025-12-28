import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { usePopover } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { useCallback } from 'react';

import { CustomPopover } from '@/front/components/custom-popover';
import { Iconify } from '@/front/components/iconify/iconify';

// ----------------------------------------------------------------------

export type SidebarUserMenuProps = {
	user?: {
		displayName: string;
		email: string;
		photoURL: string;
		role?: string;
	};
	isCollapsed?: boolean;
	sx?: SxProps<Theme>;
};

const menuItems = [
	{
		label: 'Profile',
		icon: 'solar:user-circle-bold-duotone' as string,
		href: '/profile',
	},
	{
		label: 'Settings',
		icon: 'solar:settings-bold-duotone' as string,
		href: '/settings',
	},
	{
		label: 'Billing',
		icon: 'solar:card-bold-duotone' as string,
		href: '/billing',
	},
];

export const SidebarUserMenu = ({
	user,
	isCollapsed = false,
	sx,
}: SidebarUserMenuProps) => {
	const { open, anchorEl, onClose, onOpen } = usePopover();

	const handleLogout = useCallback(() => {
		onClose();
		// Add logout logic here
	}, [onClose]);

	const handleMenuClick = useCallback(
		(href: string) => {
			onClose();
			// Add navigation logic here
			console.log('Navigate to:', href);
		},
		[onClose],
	);

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
					<Avatar
						alt={user?.displayName}
						src={user?.photoURL}
						sx={{ width: 32, height: 32 }}
					/>
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
				<Avatar
					alt={user?.displayName}
					src={user?.photoURL}
					sx={{ width: 32, height: 32 }}
				/>

				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography
						noWrap
						variant="body2"
						sx={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.2 }}
					>
						{user?.displayName}
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

	const renderMenuList = () => {
		return (
			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={{
					arrow: { hide: true },
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
						{user?.displayName}
					</Typography>
					<Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
						{user?.email}
					</Typography>
				</Box>

				<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

				<MenuList sx={{ py: 0.5 }}>
					{menuItems.map((item) => (
						<MenuItem
							key={item.label}
							onClick={() => handleMenuClick(item.href)}
							sx={{ gap: 1, py: 0.5, minHeight: 32 }}
						>
							<Iconify width={18} icon={item.icon as never} />
							<Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
								{item.label}
							</Typography>
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
							Log out
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
