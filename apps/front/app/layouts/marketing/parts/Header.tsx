/* eslint-disable jsx-a11y/anchor-is-valid */
import { Box, Burger, Button, Divider, Drawer, Group, ScrollArea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, useSearchParams } from 'react-router';

import { LanguagePicker } from '@/front/components/language-picker/LanguagePicker';
import { FRONT_PATH_NAMES, queryParamKey } from '@/shared/lib/constants';

import { classes } from './Header.css';

const Header = () => {
	const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false);
	const [search] = useSearchParams();

	return (
		<Box>
			<header className={classes.header}>
				<Group justify="space-between" h="100%">
					{/* <MantineLogo size={30} /> */}
					<div>LOGO</div>

					<Group h="100%" gap={0} visibleFrom="sm">
						<a href="#" className={classes.link}>
							Home
						</a>
						<a href="#" className={classes.link}>
							Learn
						</a>
						<a href="#" className={classes.link}>
							Academy
						</a>
					</Group>

					<Group visibleFrom="sm">
						<LanguagePicker />
						<Button
							// onClick={(e) => {
							// 	e.preventDefault();
							// }}
							component={Link}
							variant="default"
							to={{
								pathname: FRONT_PATH_NAMES.auth.login,
								search: search.get(queryParamKey.language)
									? `?${queryParamKey.language}=${search.get(queryParamKey.language)}`
									: '',
							}}
						>
							Log in
						</Button>
						<Button disabled>Sign up</Button>
					</Group>

					<Burger opened={drawerOpened} onClick={toggleDrawer} hiddenFrom="sm" />
				</Group>
			</header>

			<Drawer
				opened={drawerOpened}
				onClose={closeDrawer}
				size="100%"
				padding="md"
				title="Navigation"
				hiddenFrom="sm"
				zIndex={1000000}
			>
				<ScrollArea h="calc(100vh - 80px)" mx="-md">
					<Divider my="sm" />

					<a href="#" className={classes.link}>
						Home
					</a>
					<a href="#" className={classes.link}>
						Learn
					</a>
					<a href="#" className={classes.link}>
						Academy
					</a>

					<Divider my="sm" />

					<Group justify="center" grow pb="xl" px="md">
						<Button variant="default">Log in</Button>
						<Button>Sign up</Button>
					</Group>
				</ScrollArea>
			</Drawer>
		</Box>
	);
};

export default Header;
