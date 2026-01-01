import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import type { IconButtonProps } from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import { usePopover } from 'minimal-shared/hooks';

// import { useMockedUser } from '@/front/auth/hooks';
// import { RouterLink } from '@/front/routes/components';
// import { usePathname } from '@/front/routes/hooks';
// import { paths } from '@/front/routes/paths';

import { CustomPopover } from '@/front/components/custom-popover';
import { Label } from '@/front/components/label';
import { RouterLink } from '@/front/components/router-link';
import { usePathname } from '@/front/hooks/use-pathname';
import { useGetUserAuthData } from '@/front/lib/react-query/features/common/auth.hooks';

import { logout } from '@/front/lib/cookies/logout.utils';
import { useCallback } from 'react';
import { AccountButton } from './account-button';
import { SignOutButton } from './sign-out-button';

// ----------------------------------------------------------------------

export type AccountPopoverProps = IconButtonProps & {
	data?: {
		label: string;
		href: string;
		icon?: React.ReactNode;
		info?: React.ReactNode;
	}[];
};

export const AccountPopover = ({
	data = [],
	sx,
	...other
}: AccountPopoverProps) => {
	const pathname = usePathname();

	const { open, anchorEl, onClose, onOpen } = usePopover();

	const { data: userData } = useGetUserAuthData();

	const handleLogout = useCallback(() => {
		onClose();
		logout();
	}, [onClose]);

	const renderMenuActions = () => {
		return (
			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={{
					paper: { sx: { p: 0, width: 200 } },
					arrow: { offset: 20 },
				}}
			>
				<Box sx={{ p: 2, pb: 1.5 }}>
					<Typography variant="subtitle2" noWrap>
						{userData?.email}
					</Typography>

					<Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
						{userData?.email}
					</Typography>
				</Box>

				<Divider sx={{ borderStyle: 'dashed' }} />

				<MenuList sx={{ p: 1, my: 1, '& li': { p: 0 } }}>
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
										px: 1,
										py: 0.75,
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

				<Divider sx={{ borderStyle: 'dashed' }} />

				<Box sx={{ p: 1 }}>
					<SignOutButton
						size="medium"
						variant="text"
						onClick={handleLogout}
						sx={{ display: 'block', textAlign: 'left' }}
					/>
				</Box>
			</CustomPopover>
		);
	};

	return (
		<>
			<AccountButton
				onClick={onOpen}
				photoURL={userData?.avatarUrl ?? ''}
				displayName={userData?.email ?? ''}
				sx={sx}
				{...other}
			/>

			{renderMenuActions()}
		</>
	);
};
