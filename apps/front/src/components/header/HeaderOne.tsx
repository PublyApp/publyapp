'use client';

import { useEffect, useRef, useState } from 'react';

import { AppBar, Box, Button, Container, Link, Toolbar, useTheme, CircularProgress } from '@mui/material';
import NextLink from 'next/link';
// import { useRouter } from 'next/router';
import { useRouter } from 'next/navigation';
import { Logout as LogoutIcon } from '@mui/icons-material';

import { pxToRem } from '@aktiveo/ui-react/utils/styles';
import { useAuth } from '@aktiveo/ui-react/hooks/useAuth';
import { useLogOutMutation } from '@aktiveo/ui-react/query/features/auth/auth.hooks';

import { headerMenu } from '../../data/headerMenu';

const HeaderOne = () => {
	const appBarRef = useRef<HTMLDivElement>(null);
	const [appBarHeight, setAppBarHeight] = useState<number>(0);
	const theme = useTheme();
	const { isAuthed } = useAuth();
	const router = useRouter();
	// const router = useNavigation();

	const { mutate: logOut, isPending } = useLogOutMutation();

	useEffect(() => {
		setAppBarHeight(appBarRef.current?.getBoundingClientRect().height);
	}, []);

	return (
		<>
			<AppBar ref={appBarRef} sx={{ bgcolor: '#fff', color: '#000' }}>
				<Container>
					<Box component="nav" display="flex" /*  alignItems="center" */ /*  height={pxToRem(70)} */>
						<Box display="flex" alignItems="center">
							<Link
								component={NextLink}
								href="/"
								display="flex"
								height={pxToRem(70)}
								paddingX={pxToRem(12)}
								paddingY={pxToRem(8)}
								// bgcolor="red"
							>
								<Box
									component="img"
									width={pxToRem(34)}
									// height={pxToRem(37)}
									src="https://vulk.cssninja.io/assets/logo/logo.svg"
									alt="logo"
								/>
							</Link>
						</Box>

						<Box /* height="inherit" */ display="flex" flexGrow={1} /* bgcolor="blue" */ justifyContent="space-between">
							<Box display="flex" /*  flexGrow={1} */>
								{headerMenu.map((item) => {
									return (
										<Link
											key={item.text}
											component={NextLink}
											href={item.path}
											sx={{ color: theme.palette.grey[800], textDecoration: 'none' }}
											fontWeight={600}
											height={pxToRem(70)}
											paddingX={pxToRem(12)}
											paddingY={pxToRem(8)}
											// bgcolor="red"
											display="flex"
											alignItems="center"
										>
											{item.text}
										</Link>
									);
								})}
							</Box>

							<Box /* marginLeft="auto" */ height={pxToRem(70)} paddingX={pxToRem(12)} paddingY={pxToRem(8)}>
								{!isAuthed ? (
									<Button
										variant="contained"
										onClick={() => {
											router.push('/login');
										}}
										sx={{ height: pxToRem(48) }}
									>
										Log in
									</Button>
								) : (
									<Button
										variant="contained"
										onClick={() => {
											logOut();
										}}
										startIcon={isPending ? <CircularProgress color="inherit" size="16px" /> : <LogoutIcon />}
										sx={{ height: pxToRem(48) }}
									>
										Log out
									</Button>
								)}
							</Box>
						</Box>
					</Box>
				</Container>
			</AppBar>
			<Toolbar variant="dense" sx={{ minHeight: `${appBarHeight}px` }} />
		</>
	);
};

export default HeaderOne;
