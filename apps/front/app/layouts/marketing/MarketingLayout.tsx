import { AppShell, Box, Burger, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link } from 'react-router';

type Props = {
	children: React.ReactNode;
};

const MarketingLayout = ({ children }: Props) => {
	const [opened, { toggle }] = useDisclosure();

	return (
		<AppShell
			header={{ height: 60 }}
			navbar={{ width: 300, breakpoint: 'sm', collapsed: { desktop: true, mobile: !opened } }}
			padding="md"
		>
			<AppShell.Header>
				<Group h="100%" px="md">
					<Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
					<Group justify="space-between" style={{ flex: 1 }}>
						<Box>Logo</Box>
						<Group ml="xl" gap={0} visibleFrom="sm">
							<Link to="/login" /* className={classes.control} */>Login</Link>
						</Group>
					</Group>
				</Group>
			</AppShell.Header>

			<AppShell.Navbar py="md" px={4}>
				<Link to="/login" /* className={classes.control} */>Login</Link>
			</AppShell.Navbar>

			<AppShell.Main>
				{/* Navbar is only visible on mobile, links that are rendered in the header on desktop are hidden on mobile in
				header and rendered in navbar instead. */}
				{children}
			</AppShell.Main>
		</AppShell>
	);
};

export default MarketingLayout;
