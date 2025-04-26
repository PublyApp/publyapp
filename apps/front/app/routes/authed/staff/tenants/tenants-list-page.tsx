import _ from 'lodash';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { useTranslate } from '@/front/hooks/use-translate';
import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { RouterLink } from '@/front/components/router-link';
import Button from '@mui/material/Button';
import { Iconify } from '@/front/components/iconify/iconify';
import {
	createMRTColumnHelper,
	MaterialReactTable,
	useMaterialReactTable,
} from 'material-react-table';
import Box from '@mui/material/Box';
import { varAlpha } from 'minimal-shared/utils';

export type Tenant = {
	avatar: string;
	firstName: string;
	lastName: string;
	email: string;
};

const columnHelper = createMRTColumnHelper<Tenant>();

const data: Tenant[] = [
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'John',
		lastName: 'Doe',
		email: 'johndoe123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Jane',
		lastName: 'Doe',
		email: 'janedoe123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Jack',
		lastName: 'Doe',
		email: 'jackdoe123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Alice',
		lastName: 'Smith',
		email: 'alicesmith123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Bob',
		lastName: 'Johnson',
		email: 'bobjohnson123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Charlie',
		lastName: 'Brown',
		email: 'charliebrown123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Diana',
		lastName: 'White',
		email: 'dianawhite123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Ethan',
		lastName: 'Green',
		email: 'ethangreen123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Fiona',
		lastName: 'Black',
		email: 'fionablack123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'George',
		lastName: 'Gray',
		email: 'georgegray123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Hannah',
		lastName: 'Blue',
		email: 'hannahblue123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Ian',
		lastName: 'Red',
		email: 'ianred123@gmail.com',
	},
	{
		avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${Math.random()}`,
		firstName: 'Julia',
		lastName: 'Yellow',
		email: 'juliayellow123@gmail.com',
	},
];

const TenantsListPage = () => {
	const { t } = useTranslate();

	const columns = [
		columnHelper.accessor('avatar', {
			header: 'Avatar',
			Cell: ({ cell }) => (
				<Box
					component="img"
					src={cell.getValue()}
					alt="Avatar"
					width={40}
					height={40}
					borderRadius={50}
				/>
			),
			size: 50,
		}),
		columnHelper.accessor('firstName', {
			header: 'First Name',
			size: 150,
		}),
		columnHelper.accessor('lastName', {
			header: 'Last Name',
			size: 150,
		}),
		columnHelper.accessor('email', {
			header: 'Email',
			size: 200,
		}),
		columnHelper.display({
			id: 'actions',
			header: 'Actions',
			Cell: ({ row }) => (
				<Box sx={{ display: 'flex', gap: 1 }}>
					<Button
						variant="outlined"
						color="primary"
						onClick={() => console.log(`Send email to ${row.original.email}`)}
						className="secondary"
					>
						Send email
					</Button>
					<Button
						variant="contained"
						color="error"
						onClick={() => console.log(`Delete tenant ${row.original.email}`)}
						classes="danger"
					>
						Delete
					</Button>
				</Box>
			),
		}),
	];

	const table = useMaterialReactTable({
		columns,
		data,
	});

	const renderContent = () => {
		return (
			<Box
				sx={[
					(theme) => {
						return {
							mt: 5,
							width: 1,
							height: 320,
							borderRadius: 2,
							border: `dashed 1px ${theme.vars.palette.divider}`,
							bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.04),
						};
					},
					// ...(Array.isArray(sx) ? sx : [sx]),
				]}
			>
				<MaterialReactTable table={table} />
			</Box>
		);
	};

	return (
		<DashboardContent
			/* maxWidth="xl" */
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
		>
			<CustomBreadcrumbs
				heading={t('list-of-items', { items: t('tenants') })}
				links={[
					// { name: 'Dashboard', href: paths.dashboard.root },
					{
						name: _.capitalize(t('tenants')),
						href: FRONT_PATH_NAMES.staff.tenants.root,
					},
					{ name: _.capitalize(t('list')) },
				]}
				action={
					<Button
						component={RouterLink}
						href="#"
						variant="contained"
						startIcon={<Iconify icon="mingcute:add-line" />}
					>
						New product
					</Button>
				}
				// sx={{ mb: { xs: 3, md: 5 } }}
			/>
			{renderContent()}
		</DashboardContent>
	);
};

export default TenantsListPage;
