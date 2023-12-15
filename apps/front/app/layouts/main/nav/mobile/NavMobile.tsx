/* eslint-disable @typescript-eslint/no-use-before-define */
import { useEffect, useState } from 'react';

import { Button, Drawer, IconButton, List, Stack } from '@mui/material';
import { useLocation } from '@remix-run/react';

import Logo from '@/front/components/Logo';
import { NAV } from '@/front/lib/constants';
import Iconify from '@/ui-react/components/Iconify';
import Scrollbar from '@/ui-react/components/Scrollbar';

import type { NavProps } from '../types';

import NavList from './NavList';

// ----------------------------------------------------------------------

const NavMobile = ({ data }: NavProps) => {
	const { pathname } = useLocation();

	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (open) {
			handleClose();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pathname]);

	const handleOpen = () => {
		setOpen(true);
	};

	const handleClose = () => {
		setOpen(false);
	};

	return (
		<>
			<IconButton onClick={handleOpen} sx={{ ml: 1, color: 'inherit' }}>
				<Iconify icon="carbon:menu" />
			</IconButton>

			<Drawer
				open={open}
				onClose={handleClose}
				PaperProps={{
					sx: {
						pb: 5,
						width: NAV.W_BASE,
					},
				}}
			>
				<Scrollbar>
					<Logo sx={{ mx: 2.5, my: 3 }} />

					<List component="nav" disablePadding>
						{data.map((link) => {
							return <NavList key={link.title} item={link} />;
						})}
					</List>

					<Stack spacing={1.5} sx={{ p: 3 }}>
						<Button fullWidth variant="contained" color="inherit">
							Buy Now
						</Button>
					</Stack>
				</Scrollbar>
			</Drawer>
		</>
	);
};

export default NavMobile;
