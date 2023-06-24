// import { useEffect, useRef, useState } from 'react';

import InstagramIcon from '@mui/icons-material/Instagram';
import TwitterIcon from '@mui/icons-material/Twitter';
import { AppBar, Box, Container, Grid, Typography, useTheme, Link } from '@mui/material';
import NextLink from 'next/link';
import FacebookIcon from '@mui/icons-material/Facebook';

// import Link from '../Link';
import { dateFormate } from '../../utils';

const topHeader = [
	{ label: dateFormate() },
	{ label: 'Advertisement', link: '#a' },
	{ label: 'About', link: '/about' },
	{ label: 'Contact', link: '#b' },
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
				<Box>
					<Container>
						<Grid container>
							<Grid item>
								<Box>
									{/* {socials.map((e) => {
										return (
											<Link key={e.link} href={e.link}>
												{e.icon}
											</Link>
										);
									})} */}
								</Box>
							</Grid>
							<Grid item />
						</Grid>
					</Container>
				</Box>
			</AppBar>
			{/* <Toolbar sx={{ height: `${appBarRef.current.getBoundingClientRect().height}px` }} /> */}
		</>
	);
};

export default HeaderOne;
