import { Outlet, Link } from 'react-router-dom';
import {
	AppBar,
	Box,
	Button,
	Divider,
	Drawer,
	List,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Toolbar,
	Typography,
	Grid,
	Breadcrumbs,
	CircularProgress,
} from '@mui/material';
import {
	Home as HomeIcon,
	Person as PersonIcon,
	Article as ArticleIcon,
	Logout as LogoutIcon,
	NavigateNext as NavigateNextIcon,
	// Settings as SettingsIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

import { useLogOutMutation } from '@aktiveo/ui-react/query/features/auth/auth.hooks';

import { useApp } from '../hooks/useApp';
import { useAuth } from '../hooks/useAuth';

// import Link from './Link';

const drawerWidth = 240;

const menuItems = [
	{
		text: 'Home',
		icon: <HomeIcon />,
		link: '/',
	},
	{
		text: 'Posts',
		icon: <ArticleIcon />,
		link: '/posts',
	},
	{
		text: 'Account',
		icon: <PersonIcon />,
		link: '/account',
	},
	// {
	// 	text: 'Settings',
	// 	icon: <SettingsIcon />,
	// 	link: '/settings',
	// },
];

const Layout = () => {
	const { breadcrumbs, locale } = useApp();
	const { t } = useTranslation();

	const { mutate: logOut, isPending } = useLogOutMutation({ useAuth });

	const handleLogOut = () => {
		logOut();
	};

	return (
		<Box sx={{ display: 'flex' }}>
			<AppBar position="fixed" sx={{ width: `calc(100% - ${drawerWidth}px)`, ml: `${drawerWidth}px` }}>
				<Toolbar>
					<Grid container justifyContent="space-between">
						<Grid item>
							<Typography variant="h6" noWrap component="div">
								{/* Permanent drawer */}
								{t('common:hello')}&nbsp; the current locale is {locale}
							</Typography>
						</Grid>
						<Grid item>
							<Button variant="contained" color="primary" disableElevation onClick={handleLogOut}>
								{isPending ? <CircularProgress color="inherit" size="16px" /> : <LogoutIcon />}{' '}
								<Typography textTransform="capitalize" ml="0.5rem">
									Log Out
								</Typography>
							</Button>
						</Grid>
					</Grid>
				</Toolbar>
			</AppBar>

			<Drawer
				variant="permanent"
				sx={{
					width: `${drawerWidth}px`,
					flexShrink: 0,
					'& .MuiDrawer-paper': {
						width: drawerWidth,
						boxSizing: 'border-box',
					},
				}}
				anchor="left"
			>
				<Toolbar />
				<Divider />

				<List>
					{menuItems.map((item) => {
						return (
							<ListItem key={item.text} disablePadding component={Link} to={item.link}>
								<ListItemButton>
									<ListItemIcon>{item.icon}</ListItemIcon>
									<ListItemText primary={item.text} />
								</ListItemButton>
							</ListItem>
						);
					})}
				</List>
			</Drawer>

			<Box component="main" sx={{ flexGrow: 1 }}>
				<Toolbar />
				<Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} aria-label="breadcrumb">
					<Typography>Home</Typography>
					<Typography>Stats</Typography>
					{breadcrumbs.map(({ link, text }) => {
						return (
							<Link key={text} to={link}>
								{text}
							</Link>
						);
					})}
				</Breadcrumbs>
				{/* <Typography variant="h5">ok</Typography> */}
				<Outlet />
			</Box>
		</Box>
	);
};

export default Layout;
