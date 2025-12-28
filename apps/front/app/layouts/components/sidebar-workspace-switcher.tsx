import Avatar from '@mui/material/Avatar';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { usePopover } from 'minimal-shared/hooks';
import { varAlpha } from 'minimal-shared/utils';
import { useCallback, useState } from 'react';

import { CustomPopover } from '@/front/components/custom-popover';
import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label';
import { Scrollbar } from '@/front/components/scrollbar';

// ----------------------------------------------------------------------

export type SidebarWorkspaceSwitcherProps = {
	data?: {
		id: string;
		name: string;
		logo: string;
		plan: string;
	}[];
	isCollapsed?: boolean;
	sx?: SxProps<Theme>;
};

export const SidebarWorkspaceSwitcher = ({
	data = [],
	isCollapsed = false,
	sx,
}: SidebarWorkspaceSwitcherProps) => {
	const { open, anchorEl, onClose, onOpen } = usePopover();

	const [workspace, setWorkspace] = useState(data[0]);

	const handleChangeWorkspace = useCallback(
		(newValue: (typeof data)[0]) => {
			setWorkspace(newValue);
			onClose();
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
						alt={workspace?.name}
						src={workspace?.logo}
						sx={(theme) => ({
							width: 24,
							height: 24,
							borderRadius: `${theme.shape.borderRadius}px`,
						})}
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
					alt={workspace?.name}
					src={workspace?.logo}
					sx={(theme) => ({
						width: 24,
						height: 24,
						borderRadius: `${theme.shape.borderRadius}px`,
					})}
				/>

				<Typography
					noWrap
					variant="body2"
					sx={{ flex: 1, fontWeight: 600, fontSize: '0.8125rem' }}
				>
					{workspace?.name}
				</Typography>

				<Iconify
					width={16}
					icon="lucide:chevrons-up-down"
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
						{data.map((option) => {
							return (
								<MenuItem
									key={option.id}
									selected={option.id === workspace?.id}
									onClick={() => handleChangeWorkspace(option)}
									sx={{ gap: 1, py: 0.5, minHeight: 32 }}
								>
									<Avatar
										alt={option.name}
										src={option.logo}
										sx={{ width: 20, height: 20 }}
									/>

									<Typography
										noWrap
										component="span"
										variant="body2"
										sx={{ flexGrow: 1, fontSize: '0.8125rem' }}
									>
										{option.name}
									</Typography>

									<Label
										color={option.plan === 'Free' ? 'default' : 'info'}
										sx={{ height: 18, fontSize: '0.65rem' }}
									>
										{option.plan}
									</Label>
								</MenuItem>
							);
						})}
					</MenuList>
				</Scrollbar>

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
