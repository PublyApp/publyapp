import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import { useEffect, useRef } from 'react';

import { Logo } from '#app/components/logo/logo.tsx';
import { Scrollbar } from '#app/components/scrollbar/scrollbar.tsx';
import { usePathname } from '#app/hooks/use-pathname.ts';

import { SignInButton } from '../../../components/sign-in-button';
import { Nav, NavUl } from '../components';
import type { NavMainProps } from '../types';
import { NavList } from './nav-mobile-list';

// ----------------------------------------------------------------------

export type NavMobileProps = NavMainProps & {
	open: boolean;
	onClose: () => void;
	slots?: {
		topArea?: React.ReactNode;
		bottomArea?: React.ReactNode;
	};
};

export const NavMobile = ({
	data,
	open,
	onClose,
	slots,
	sx,
}: NavMobileProps) => {
	const pathname = usePathname();
	const openRef = useRef(open);
	const onCloseRef = useRef(onClose);

	openRef.current = open;
	onCloseRef.current = onClose;

	useEffect(() => {
		if (openRef.current) {
			onCloseRef.current();
		}
	}, [pathname]);

	return (
		<Drawer
			open={open}
			onClose={onClose}
			slotProps={{
				paper: {
					sx: [
						{
							display: 'flex',
							flexDirection: 'column',
							width: 'var(--layout-nav-mobile-width)',
						},
						...(Array.isArray(sx) ? sx : [sx]),
					],
				},
			}}
		>
			{slots?.topArea ?? (
				<Box
					sx={{
						pt: 3,
						pb: 2,
						pl: 2.5,
						display: 'flex',
					}}
				>
					<Logo />
				</Box>
			)}

			<Scrollbar fillContent>
				<Nav
					sx={{
						pb: 3,
						display: 'flex',
						flex: '1 1 auto',
						flexDirection: 'column',
					}}
				>
					<NavUl>
						{data.map((list) => {
							return <NavList key={list.title} data={list} />;
						})}
					</NavUl>
				</Nav>
			</Scrollbar>

			{slots?.bottomArea ?? (
				<Box
					sx={{
						py: 3,
						px: 2.5,
						gap: 1.5,
						display: 'flex',
					}}
				>
					<SignInButton fullWidth />

					<Button fullWidth variant="contained" rel="noopener" href="#">
						Purchase
					</Button>
				</Box>
			)}
		</Drawer>
	);
};
