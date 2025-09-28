import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import { useBoolean } from 'minimal-shared/hooks';
import { AnimateBorder } from '@/front/components/animate';
import { Iconify } from '@/front/components/iconify/iconify';
import { Label } from '@/front/components/label';
import { RouterLink } from '@/front/components/router-link';
import { Scrollbar } from '@/front/components/scrollbar';
import { usePathname } from '@/front/hooks/use-pathname';
import { useGetUserAuthData } from '@/front/lib/react-query/features/auth/auth.hooks';
import { getUserFullName } from '@/shared/utils/user.utils';
import { AccountButton } from './account-button';
import { SignOutButton } from './sign-out-button';

// ----------------------------------------------------------------------

export type AccountDrawerProps = IconButtonProps & {
	data?: {
		label: string;
		href: string;
		icon?: React.ReactNode;
		info?: React.ReactNode;
	}[];
};

export const AccountDrawer = ({
	data = [],
	sx,
	...other
}: AccountDrawerProps) => {
	const pathname = usePathname();

	const { data: userData } = useGetUserAuthData();

	const { value: open, onFalse: onClose, onTrue: onOpen } = useBoolean();

	const renderAvatar = () => {
		return (
			<AnimateBorder
				sx={{ mb: 2, p: '6px', width: 96, height: 96, borderRadius: '50%' }}
				slotProps={{
					primaryBorder: { size: 120, sx: { color: 'primary.main' } },
				}}
			>
				<Avatar
					src={userData?.avatarUrl || ''}
					alt={getUserFullName(userData)}
					sx={{ width: 1, height: 1 }}
				>
					{getUserFullName(userData).charAt(0).toUpperCase()}
				</Avatar>
			</AnimateBorder>
		);
	};

	const renderList = () => {
		return (
			<MenuList
				disablePadding
				sx={[
					(theme) => {
						return {
							py: 3,
							px: 2.5,
							borderTop: `dashed 1px ${theme.vars.palette.divider}`,
							borderBottom: `dashed 1px ${theme.vars.palette.divider}`,
							'& li': { p: 0 },
						};
					},
				]}
			>
				{data.map((option) => {
					const rootLabel = pathname.includes('/dashboard')
						? 'Home'
						: 'Dashboard';
					const rootHref = pathname.includes('/dashboard') ? '/' : '#';

					return (
						<MenuItem key={option.label}>
							<Link
								component={RouterLink}
								href={option.label === 'Home' ? rootHref : option.href}
								color="inherit"
								underline="none"
								onClick={onClose}
								sx={{
									p: 1,
									width: 1,
									display: 'flex',
									typography: 'body2',
									alignItems: 'center',
									color: 'text.secondary',
									'& svg': { width: 24, height: 24 },
									'&:hover': { color: 'text.primary' },
								}}
							>
								{option.icon}

								<Box component="span" sx={{ ml: 2 }}>
									{option.label === 'Home' ? rootLabel : option.label}
								</Box>

								{option.info && (
									<Label color="error" sx={{ ml: 1 }}>
										{option.info}
									</Label>
								)}
							</Link>
						</MenuItem>
					);
				})}
			</MenuList>
		);
	};

	return (
		<>
			<AccountButton
				onClick={onOpen}
				photoURL={userData?.avatarUrl || ''}
				displayName={getUserFullName(userData)}
				sx={sx}
				{...other}
			/>

			<Drawer
				open={open}
				onClose={onClose}
				anchor="right"
				slotProps={{
					backdrop: { invisible: true },
					paper: { sx: { width: 320 } },
				}}
			>
				<IconButton
					onClick={onClose}
					sx={{
						top: 12,
						left: 12,
						zIndex: 9,
						position: 'absolute',
					}}
				>
					<Iconify icon="mingcute:close-line" />
				</IconButton>

				<Scrollbar>
					<Box
						sx={{
							pt: 8,
							pb: 3,
							display: 'flex',
							alignItems: 'center',
							flexDirection: 'column',
						}}
					>
						{renderAvatar()}

						<Typography variant="subtitle1" noWrap sx={{ mt: 2 }}>
							{getUserFullName(userData)}
						</Typography>

						<Typography
							variant="body2"
							sx={{ color: 'text.secondary', mt: 0.5 }}
							noWrap
						>
							{userData?.email}
						</Typography>
					</Box>

					{/* <Box
						sx={{
							p: 3,
							gap: 1,
							flexWrap: 'wrap',
							display: 'flex',
							justifyContent: 'center',
						}}
					>
						{Array.from({ length: 3 }, (_, index) => {
							return (
								<Tooltip
									key={_mock.fullName(index + 1)}
									title={`Switch to: ${_mock.fullName(index + 1)}`}
								>
									<Avatar
										alt={_mock.fullName(index + 1)}
										src={_mock.image.avatar(index + 1)}
										onClick={() => {}}
									/>
								</Tooltip>
							);
						})}

						<Tooltip title="Add account">
							<IconButton
								sx={[
									(theme) => {
										return {
											bgcolor: varAlpha(
												theme.vars.palette.grey['500Channel'],
												0.08,
											),
											border: `dashed 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.32)}`,
										};
									},
								]}
							>
								<Iconify icon="mingcute:add-line" />
							</IconButton>
						</Tooltip>
					</Box> */}

					{renderList()}

					{/* <Box sx={{ px: 2.5, py: 3 }}>
						<UpgradeBlock />
					</Box> */}
				</Scrollbar>

				<Box sx={{ p: 2.5 }}>
					<SignOutButton onClose={onClose} />
				</Box>
			</Drawer>
		</>
	);
};
