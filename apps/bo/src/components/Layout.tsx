import { Outlet } from 'react-router-dom';
import {
	AppBar,
	Box,
	Divider,
	Drawer,
	List,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Toolbar,
	Typography,
} from '@mui/material';
import { Home as HomeIcon, Person as PersonIcon, Article as ArticleIcon } from '@mui/icons-material';

import Link from './Link';

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
];

const Layout = () => {
	return (
		<Box sx={{ display: 'flex' }}>
			<AppBar position="fixed" sx={{ width: `calc(100% - ${drawerWidth}px)`, ml: `${drawerWidth}px` }}>
				<Toolbar>
					<Typography variant="h6" noWrap component="div">
						Permanent drawer
					</Typography>
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
				{/* <Typography variant="h5">ok</Typography> */}
				<Outlet />
			</Box>
		</Box>
	);
};

export default Layout;
