// import { useEffect, useRef, useState } from 'react';
// import { Fragment } from 'react';

import InstagramIcon from '@mui/icons-material/Instagram';
import TwitterIcon from '@mui/icons-material/Twitter';
import { AppBar, Box, Container, Grid, Typography, useTheme, Link, IconButton } from '@mui/material';
import NextLink from 'next/link';
import FacebookIcon from '@mui/icons-material/Facebook';
import SearchIcon from '@mui/icons-material/Search';
import MenuIcon from '@mui/icons-material/Menu';

// import Link from '../Link';
import HeaderMenu from '../../data/menu/HeaderMenu.json';
import { dateFormate } from '../../utils';

const topHeader = [
	{ label: dateFormate() },
	{ label: 'Advertisement', link: '/' },
	{ label: 'About', link: '/about' },
	{ label: 'Contact', link: '/' },
];

const socials = [
	{
		icon: <FacebookIcon fontSize="small" />,
		link: '#a',
	},
	{
		icon: <InstagramIcon fontSize="small" />,
		link: '#b',
	},
	{
		icon: <TwitterIcon fontSize="small" />,
		link: '#c',
	},
];

const HeaderOne = () => {
	const theme = useTheme();
	// const appBarRef = useRef<HTMLDivElement>(null);
	// // useState(0);

	// useEffect(() => {
	// 	console.log('====================================');
	// 	console.log(appBarRef.current.getBoundingClientRect());
	// 	console.log('====================================');
	// }, []);

	return (
		<>
			<AppBar /* ref={appBarRef} */ position="static" elevation={0}>
				{/* <Toolbar>ok</Toolbar> */}
				<Box bgcolor={theme.palette.black} paddingY=".5rem">
					<Container>
						<Grid container justifyContent="space-between" alignItems="center">
							<Grid item>
								{/* <Typography variant="body2" marginRight="2rem" padding=".5rem 0">
								{dateFormate()}
							</Typography> */}
								<Box>
									{topHeader.map((e) => {
										if (e.link) {
											return (
												<Link
													key={e.label}
													href={e.link}
													component={NextLink}
													variant="body2"
													color="#FFF"
													sx={{ textDecoration: 'unset' }}
													marginRight="2rem"
													padding=".5rem 0"
												>
													{/* <Typography variant="body2" marginRight="2rem" padding=".5rem 0" display="inline-block"> */}
													{e.label}
													{/* </Typography> */}
												</Link>
											);
										}

										return (
											<Typography
												key={e.label}
												variant="body2"
												marginRight="2rem"
												padding=".5rem 0"
												display="inline-block"
											>
												{e.label}
											</Typography>
										);
									})}
								</Box>
							</Grid>
							<Grid item>
								<Box display="flex" alignItems="center">
									{socials.map((e) => {
										return (
											<Link
												key={e.link}
												href={e.link}
												component={NextLink}
												variant="body2"
												color="#FFF"
												sx={{ textDecoration: 'unset' }}
												marginLeft="2rem"
												display="inline-flex"
												alignItems="center"
												justifyContent="center"
											>
												{/* <Typography color="#FFF" display="inline-block" marginLeft="2rem"> */}
												{e.icon}
												{/* </Typography> */}
											</Link>
										);
									})}
								</Box>
							</Grid>
						</Grid>
					</Container>
				</Box>
				<Box bgcolor="#FFF" borderBottom={`1px solid ${theme.palette.grey[300]}`}>
					<Container>
						<Grid container /*  paddingY="30px" */ alignItems="center">
							<Grid item>
								<Box display="flex" alignItems="center">
									{/* Logo */}
									<Box>
										<Typography variant="h6" color={theme.palette.black}>
											Aktiv
										</Typography>
									</Box>

									{/* Menu */}
									<Box component="nav" marginLeft="44px">
										{HeaderMenu.map((item) => {
											return (
												<Link
													key={item.label}
													href={item.path}
													component={NextLink}
													sx={{
														textDecoration: 'unset',
														position: 'relative',
														'&:hover:before': {
															width: '100%',
														},
														'&::before': {
															content: '""',
															position: 'absolute',
															bottom: 0,
															left: 0,
															height: '.1rem',
															width: 0,
															bgcolor: 'currentcolor',
															transition: 'all .5s',
														},
													}}
													variant="body1"
													color={theme.palette.black}
													marginRight="34px"
													display="inline-block"
													marginY="30px" // because of the popover
													fontWeight="500"
												>
													{item.label}
												</Link>
											);
										})}
									</Box>
								</Box>
							</Grid>
							<Grid item ml="auto">
								<Box>
									<IconButton sx={{ color: theme.palette.black }}>
										<SearchIcon /* fontSize="large" */ />
									</IconButton>
									<IconButton sx={{ color: theme.palette.black }}>
										<MenuIcon /* fontSize="large" */ />
									</IconButton>
								</Box>
							</Grid>
						</Grid>
					</Container>
				</Box>
			</AppBar>
			{/* <Toolbar sx={{ height: `${appBarRef.current.getBoundingClientRect().height}px` }} /> */}
		</>
	);
};

export default HeaderOne;
