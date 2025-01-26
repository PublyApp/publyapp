import { AppShell, Burger, Group, Skeleton, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { nanoid } from 'nanoid';
import { Outlet } from 'react-router';

const AdminDashboardPagesLayout = () => {
	const [opened, { toggle }] = useDisclosure();

	return (
		<AppShell
			layout="alt"
			header={{ height: 60 }}
			navbar={{ width: 300, breakpoint: 'sm', collapsed: { mobile: !opened, desktop: !opened } }}
			padding="md"
		>
			<AppShell.Header>
				<Group h="100%" px="md">
					<Burger opened={opened} onClick={toggle} size="sm" />
				</Group>
			</AppShell.Header>
			<AppShell.Navbar p="md">
				<Group>
					<Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
					<Text>Navbar</Text>
				</Group>
				{Array(15)
					.fill(0)
					.map((_) => {
						return <Skeleton key={nanoid()} h={28} mt="sm" animate={false} />;
					})}
			</AppShell.Navbar>
			<AppShell.Main>
				<Outlet />
			</AppShell.Main>
		</AppShell>
	);
};

export default AdminDashboardPagesLayout;
