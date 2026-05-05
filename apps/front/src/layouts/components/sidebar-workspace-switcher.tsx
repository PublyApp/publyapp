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
import { useMemo } from 'react';
import { useParams } from 'react-router';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';
import { CustomPopover } from '@/front/components/custom-popover';
import { Iconify } from '@/front/components/iconify/iconify';
import { RouterLink } from '@/front/components/router-link';
import { Scrollbar } from '@/front/components/scrollbar';

// ----------------------------------------------------------------------

export type TenantItem = {
	id: string;
	name: string;
	code: string;
	logoUrl?: string | null;
};

export type SidebarWorkspaceSwitcherProps = {
	tenants?: TenantItem[];
	totalCount?: number;
	isCollapsed?: boolean;
	onViewAll?: () => void;
	sx?: SxProps<Theme>;
};

export const SidebarWorkspaceSwitcher = ({
	tenants = [],
	totalCount = 0,
	isCollapsed = false,
	onViewAll,
	sx,
}: SidebarWorkspaceSwitcherProps) => {
	const { open, anchorEl, onClose, onOpen } = usePopover();
	const { tenantId } = useParams<{ tenantId: string }>();

	const currentTenant = useMemo(() => {
		return tenants.find((t) => t.id === tenantId) ?? tenants[0];
	}, [tenants, tenantId]);

	const hasMoreTenants = totalCount > tenants.length;

	const handleViewAll = () => {
		onClose();
		onViewAll?.();
	};

	// Don't render if no tenants
	if (tenants.length === 0) {
		return null;
	}

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
					{currentTenant?.logoUrl ? (
						<Avatar
							alt={currentTenant?.name}
							src={currentTenant.logoUrl}
							sx={(theme) => ({
								width: 24,
								height: 24,
								borderRadius: `${theme.shape.borderRadius}px`,
							})}
						/>
					) : (
						<Box
							sx={(theme) => ({
								width: 24,
								height: 24,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								borderRadius: `${theme.shape.borderRadius}px`,
								bgcolor: 'background.neutral',
							})}
						>
							<Iconify
								width={18}
								icon="solar:buildings-bold"
								sx={{ color: 'text.disabled' }}
							/>
						</Box>
					)}
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
				{currentTenant?.logoUrl ? (
					<Avatar
						alt={currentTenant?.name}
						src={currentTenant.logoUrl}
						sx={(theme) => ({
							width: 32,
							height: 32,
							borderRadius: `${theme.shape.borderRadius}px`,
						})}
					/>
				) : (
					<Box
						sx={(theme) => ({
							width: 32,
							height: 32,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							borderRadius: `${theme.shape.borderRadius}px`,
							bgcolor: 'background.neutral',
						})}
					>
						<Iconify
							width={20}
							icon="solar:buildings-bold"
							sx={{ color: 'text.disabled' }}
						/>
					</Box>
				)}

				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography
						noWrap
						variant="body2"
						sx={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.2 }}
					>
						{currentTenant?.name}
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
						{currentTenant?.code}
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
					paper: {
						sx: {
							width: 220,
							ml: isCollapsed ? 1.1 : 0,
							mt: isCollapsed ? -1 : 0,
						},
					},
				}}
				anchorOrigin={
					isCollapsed
						? { vertical: 'top', horizontal: 'right' }
						: { vertical: 'bottom', horizontal: 'left' }
				}
				transformOrigin={
					isCollapsed
						? { vertical: 'top', horizontal: 'left' }
						: { vertical: 'top', horizontal: 'left' }
				}
			>
				<Scrollbar sx={{ maxHeight: 200 }}>
					<MenuList sx={{ py: 0.5 }}>
						{tenants.map((tenant) => (
							<MenuItem
								key={tenant.id}
								selected={tenant.id === currentTenant?.id}
								onClick={onClose}
								sx={{ p: 0 }}
							>
								<Link
									component={RouterLink}
									href={FRONT_PATH_NAMES.tenant(tenant.id).root}
									underline="none"
									color="inherit"
									sx={{
										gap: 1,
										py: 0.5,
										px: 1.5,
										width: 1,
										display: 'flex',
										alignItems: 'center',
									}}
								>
									{tenant.logoUrl ? (
										<Avatar
											alt={tenant.name}
											src={tenant.logoUrl}
											sx={(theme) => ({
												width: 24,
												height: 24,
												borderRadius: `${theme.shape.borderRadius}px`,
											})}
										/>
									) : (
										<Box
											sx={(theme) => ({
												width: 24,
												height: 24,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												borderRadius: `${theme.shape.borderRadius}px`,
												bgcolor: 'background.neutral',
											})}
										>
											<Iconify
												width={16}
												icon="solar:buildings-bold"
												sx={{ color: 'text.disabled' }}
											/>
										</Box>
									)}

									<Typography
										noWrap
										variant="body2"
										sx={{ fontSize: '0.8125rem' }}
									>
										{tenant.name}
									</Typography>
								</Link>
							</MenuItem>
						))}
					</MenuList>
				</Scrollbar>

				{hasMoreTenants && (
					<>
						<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

						<MenuItem
							onClick={handleViewAll}
							sx={{ gap: 1, py: 0.5, minHeight: 32, color: 'text.secondary' }}
						>
							<Iconify width={16} icon="solar:list-bold" />
							<Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
								View all organizations
							</Typography>
						</MenuItem>
					</>
				)}

				<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

				<MenuItem
					onClick={onClose}
					sx={{ gap: 1, py: 0.5, minHeight: 32, color: 'text.secondary' }}
				>
					<Iconify width={16} icon="mingcute:add-line" />
					<Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
						Create workspace
					</Typography>
				</MenuItem>
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
