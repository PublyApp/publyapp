import { useEffect, useState } from 'react';

import {
	Box,
	Fade,
	Unstable_Grid2 as Grid,
	Link,
	ListSubheader,
	Paper,
	Portal,
	Stack,
	styled,
	type Theme,
} from '@mui/material';
import NextLink from 'next/link';
import { useRouter } from 'next/router';

// import useActiveLink from 'src/hooks/useActiveLink';

import Image from '@devist/ui-react/components/Image';
import Label from '@devist/ui-react/components/Label';

import { NavItem } from './NavItem';
import type { NavItemBaseProps, NavListProps } from './types';

// ----------------------------------------------------------------------
type Props = { item: NavItemBaseProps };

const NavList = ({ item }: Props) => {
	// const { pathname } = useLocation();
	// const { pathname } = useRouter();

	const [openMenu, setOpenMenu] = useState(false);

	const { /* path, */ children } = item;

	// const { active, isExternalLink } = useActiveLink(path, false);

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

	useEffect(() => {
		if (openMenu) {
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			handleCloseMenu();
		}
	}, [openMenu]);

	const handleOpenMenu = () => {
		if (children) {
			setOpenMenu(true);
		}
	};

	const handleCloseMenu = () => {
		setOpenMenu(false);
	};

	return (
		<>
			<NavItem
				item={item}
				active={/* active */ false}
				open={openMenu}
				isExternalLink={/* isExternalLink */ false}
				onMouseEnter={handleOpenMenu}
				onMouseLeave={handleCloseMenu}
			/>

			{!!children && openMenu && (
				<Portal>
					<Fade in={openMenu}>
						{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
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
												// eslint-disable-next-line @typescript-eslint/no-use-before-define
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
											{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
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
	const { pathname } = useRouter();

	const coverPath = items.length ? items[0].path : '';

	const commonList = subheader === 'Common';

	return (
		<Stack spacing={2}>
			{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
			<StyledSubheader>
				{subheader}
				{isNew && (
					<Label color="info" sx={{ ml: 1 }}>
						NEW
					</Label>
				)}
			</StyledSubheader>

			{!commonList && (
				<Link component={NextLink} href={coverPath}>
					<Image
						disabledEffect
						alt={cover}
						src={cover || '/assets/placeholder.svg'}
						ratio="16/9"
						sx={{
							borderRadius: 1,
							cursor: 'pointer',
							boxShadow: (theme: Theme) => {
								return theme.customShadows.z8;
							},
							transition: (theme: Theme) => {
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

// ----------------------------------------------------------------------

const StyledMenu = styled(Paper)(({ theme }) => {
	return {
		top: 72,
		width: '100%',
		borderRadius: 0,
		position: 'fixed',
		zIndex: theme.zIndex.modal,
		// boxShadow: theme.customShadows.dialog, // TODO:
		backgroundColor: theme.palette.background.default,
	};
});

// ----------------------------------------------------------------------

const StyledSubheader = styled(ListSubheader)(({ theme }) => {
	return {
		...theme.typography.h6,
		padding: 0,
		color: theme.palette.text.primary,
		backgroundColor: 'transparent',
	};
});
