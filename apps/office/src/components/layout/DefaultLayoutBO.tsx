import { ReactNode } from 'react';

import {
	Article as ArticleIcon,
	Home as HomeIcon,
	Logout as LogoutIcon,
	NavigateNext as NavigateNextIcon,
	Person as PersonIcon,
	Settings as SettingsIcon,
} from '@mui/icons-material';
import {
	AppBar,
	Box,
	Breadcrumbs,
	Button,
	CircularProgress,
	Divider,
	Drawer,
	Grid,
	List,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Toolbar,
	Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useNavigate } from 'react-router-dom';

import { BO_PATH_NAMES, FRONT_PATH_NAMES } from '@devist/shared/utils/constants';
import { useApp } from '@devist/ui-react/hooks/useApp';
import { useLogOutMutation } from '@devist/ui-react/query/features/auth/auth.hooks';

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
	{
		text: 'Typography',
		icon: <PersonIcon />,
		link: '/typography',
	},
	{
		text: 'Buttons',
		icon: <PersonIcon />,
		link: '/buttons',
	},
	{
		text: 'AI Tools',
		icon: <SettingsIcon />,
		link: FRONT_PATH_NAMES.aiTools,
	},
	{
		text: 'Settings',
		icon: <SettingsIcon />,
		link: '/settings',
	},
];

type Props = {
	children?: ReactNode;
};

const DefaultLayoutBO = ({ children }: Props) => {
	const { state } = useApp();
	const { t } = useTranslation();
	const navigate = useNavigate();

	const {
		result: { mutate: logOut, isPending },
	} = useLogOutMutation({
		onSuccess: () => {
			navigate(BO_PATH_NAMES.logIn);
		},
	});

	const handleLogOut = () => {
		logOut();
	};

	return (
		<Box sx={{ display: 'flex' }}>
			<AppBar position="fixed" sx={{ width: `calc(100% - ${drawerWidth}px)`, ml: `${drawerWidth}px` }}>
				<Toolbar>
					<Grid container justifyContent="space-between">
						<Grid item>
							<Box display="flex" alignItems="center" height="100%">
								<Typography variant="body1" noWrap component="div">
									{/* Permanent drawer */}
									{t('common:hello')}&nbsp; the current locale is {state.locale}
								</Typography>
							</Box>
						</Grid>
						<Grid item>
							<Box>
								<Button
									variant="contained"
									color="primary"
									disableElevation
									onClick={handleLogOut}
									startIcon={isPending ? <CircularProgress color="inherit" size="16px" /> : <LogoutIcon />}
								>
									<Typography textTransform="capitalize" ml="0.5rem">
										Log Out
									</Typography>
								</Button>
							</Box>
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
					{state.breadcrumbs.map(({ link, text }) => {
						return (
							<Link key={text} to={link}>
								{text}
							</Link>
						);
					})}
				</Breadcrumbs>
				{/* <Typography variant="h5">ok</Typography> */}
				{children ?? <Outlet />}
			</Box>
		</Box>
	);
};

export default DefaultLayoutBO;
