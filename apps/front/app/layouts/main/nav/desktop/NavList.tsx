/* eslint-disable @typescript-eslint/no-use-before-define */
import { useEffect, useState } from 'react';

import { Box, Fade, Grid2 as Grid, Link, Portal, Stack } from '@mui/material';
import { Link as RouterLink, useLocation } from '@remix-run/react';

import useActiveLink from '@/front/hooks/useActiveLink';
import Image from '@/ui-react/components/image/Image';
import Label from '@/ui-react/components/Label';

import type { NavItemBaseProps, NavListProps } from '../types';

import { NavItem } from './NavItem';
import { StyledMenu, StyledSubheader } from './styles';

// ----------------------------------------------------------------------

const NavList = ({ item }: { item: NavItemBaseProps }) => {
	const { pathname } = useLocation();

	const [openMenu, setOpenMenu] = useState(false);

	const { path, children } = item;

	const { active, isExternalLink } = useActiveLink(path, false);

	const mainList = children
		? children.filter((list) => {
				return list.subheader !== 'Common';
			})
		: [];

	const commonList = children
		? children.find((list) => {
				return list.subheader === 'Common';
			})
		: null;

	const handleOpenMenu = () => {
		if (children) {
			setOpenMenu(true);
		}
	};

	const handleCloseMenu = () => {
		setOpenMenu(false);
	};

	useEffect(() => {
		if (openMenu) {
			handleCloseMenu();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pathname]);

	return (
		<>
			<NavItem
				item={item}
				active={active}
				open={openMenu}
				isExternalLink={isExternalLink}
				onMouseEnter={handleOpenMenu}
				onMouseLeave={handleCloseMenu}
			/>

			{!!children && openMenu && (
				<Portal>
					<Fade in={openMenu}>
						<StyledMenu onMouseEnter={handleOpenMenu} onMouseLeave={handleCloseMenu}>
							<Grid container columns={15}>
								<Grid xs={12}>
									<Box
										gap={5}
										display="grid"
										gridTemplateColumns="repeat(5, 1fr)"
										sx={{
											p: 5,
											height: 1,
											position: 'relative',
											bgcolor: 'background.neutral',
										}}
									>
										{mainList.map((list) => {
											return (
												<NavSubList
													key={list.subheader}
													subheader={list.subheader}
													cover={list.cover}
													items={list.items}
													isNew={list.isNew}
												/>
											);
										})}
									</Box>
								</Grid>

								{commonList && (
									<Grid xs={3}>
										<Box sx={{ bgcolor: 'background.default', p: 5 }}>
											<NavSubList subheader={commonList.subheader} items={commonList.items} />
										</Box>
									</Grid>
								)}
							</Grid>
						</StyledMenu>
					</Fade>
				</Portal>
			)}
		</>
	);
};

export default NavList;

// ----------------------------------------------------------------------

const NavSubList = ({ subheader, isNew, cover, items }: NavListProps) => {
	const { pathname } = useLocation();

	const coverPath = items.length ? items[0].path : '';

	const commonList = subheader === 'Common';

	return (
		<Stack spacing={2}>
			<StyledSubheader>
				{subheader}
				{isNew && (
					<Label color="info" sx={{ ml: 1 }}>
						NEW
					</Label>
				)}
			</StyledSubheader>

			{!commonList && (
				<Link component={RouterLink} to={coverPath}>
					<Image
						disabledEffect
						alt={cover}
						src={cover || '/assets/placeholder.svg'}
						ratio="16/9"
						sx={{
							borderRadius: 1,
							cursor: 'pointer',
							boxShadow: (theme) => {
								return theme.customShadows.z8;
							},
							transition: (theme) => {
								return theme.transitions.create('all');
							},
							'&:hover': {
								opacity: 0.8,
								boxShadow: (theme) => {
									return theme.customShadows.z24;
								},
							},
						}}
					/>
				</Link>
			)}

			<Stack spacing={1.5} alignItems="flex-start">
				{items.map((item) => {
					return <NavItem key={item.title} item={item} active={item.path === pathname} subItem />;
				})}
			</Stack>
		</Stack>
	);
};
