import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Switch from '@mui/material/Switch';
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';
import { Iconify } from '@/front/components/iconify/iconify';
import { useTranslate } from '@/front/hooks/use-translate';

const StaffProfilePermissions = () => {
	const { t } = useTranslate();

	return (
		<Card>
			<CardHeader
				title={t('permissions')}
				slotProps={{
					title: {
						color: 'inherit',
						sx: {
							display: 'inline-flex',
							'&:hover': { opacity: 0.8 },
						},
					},
				}}
			/>
			<CardContent>
				{_.map(PERMISSIONS_DATA, (group) => (
					<List
						key={group.module}
						subheader={
							<ListSubheader sx={{ px: 0 }}>{group.module}</ListSubheader>
						}
					>
						{_.map(group.permissions, (permission) => {
							return (
								<PermissionListItem
									key={permission.key}
									permission={permission}
								/>
							);
						})}
					</List>
				))}
			</CardContent>
		</Card>
	);
};

export default StaffProfilePermissions;

const PermissionListItem = ({ permission }: { permission: Permission }) => {
	const checked = useBoolean(Math.random() > 0.5);

	return (
		<ListItem
			sx={{ py: 0, px: 0 }}
			secondaryAction={
				<Switch
					edge="end"
					checked={checked.value}
					onChange={checked.onToggle}
					color="success"
					slotProps={{
						input: {
							id: `${permission.key}-switch`,
							'aria-label': `${permission.key} switch`,
						},
					}}
				/>
			}
		>
			<ListItemButton sx={{ px: 0, pl: 1 }} onClick={checked.onToggle}>
				<ListItemAvatar>
					<Avatar>
						<Iconify icon="solar:key-bold" width={24} />
					</Avatar>
				</ListItemAvatar>
				<ListItemText
					primary={permission.name}
					secondary={permission.description}
				/>
			</ListItemButton>
		</ListItem>
	);
};

type Module = {
	module: string;
	permissions: Permission[];
};

type Permission = {
	key: string;
	name: string;
	description: string;
};

// grouped by module/section/slice
const PERMISSIONS_DATA: Module[] = [
	{
		module: 'Staff Members',
		permissions: [
			{
				key: 'CAN_LIST_STAFF_MEMBERS',
				name: 'List Members',
				description:
					'Can retrieve the list of users who are members of the staff',
			},
			{
				key: 'CAN_CREATE_STAFF_MEMBER',
				name: 'Create Member',
				description: 'Can create a new user, who will be a member of the staff',
			},
			{
				key: 'CAN_GET_STAFF_MEMBER',
				name: 'Get Member',
				description:
					'Can retrieve the details of a specific user who is a member of the staff',
			},
			{
				key: 'CAN_UPDATE_STAFF_MEMBER',
				name: 'Update Member',
				description:
					'Can update the details of a specific user who is a member of the staff',
			},
			{
				key: 'CAN_DELETE_STAFF_MEMBER',
				name: 'Delete Member',
				description: 'Can delete a specific user who is a member of the staff',
			},
		],
	},
	{
		module: 'Staff Invitations',
		permissions: [
			{
				key: 'CAN_LIST_STAFF_INVITATIONS',
				name: 'List Invitations',
				description:
					'Can retrieve the list of invitations sent to join the staff',
			},
			{
				key: 'CAN_CREATE_STAFF_INVITATION',
				name: 'Create Invitation',
				description: 'Can send an invitation to join the staff',
			},
			{
				key: 'CAN_GET_STAFF_INVITATION',
				name: 'Get Invitation',
				description: 'Can retrieve the details of a specific invitation',
			},
			{
				key: 'CAN_UPDATE_STAFF_INVITATION',
				name: 'Update Invitation',
				description: 'Can update the details of a specific invitation',
			},
			{
				key: 'CAN_REVOKE_STAFF_INVITATION',
				name: 'Revoke Invitation',
				description: 'Can revoke a specific invitation',
			},
		],
	},
	{
		module: 'Staff Background Jobs',
		permissions: [
			{
				key: 'CAN_LIST_STAFF_BACKGROUND_JOBS',
				name: 'List Background Jobs',
				description: 'Can retrieve the list of background jobs',
			},
		],
	},
	{
		module: 'Staff Settings',
		permissions: [
			{
				key: 'CAN_LIST_STAFF_SETTINGS',
				name: 'List Settings',
				description: 'Can retrieve the list of settings',
			},
		],
	},
	{
		module: 'Staff Profiles',
		permissions: [
			{
				key: 'CAN_LIST_STAFF_PROFILES',
				name: 'List Profiles',
				description: 'Can retrieve the list of profiles',
			},
			{
				key: 'CAN_CREATE_STAFF_PROFILE',
				name: 'Create Profile',
				description: 'Can create a new profile',
			},
			{
				key: 'CAN_GET_STAFF_PROFILE',
				name: 'Get Profile',
				description: 'Can retrieve the details of a specific profile',
			},
			{
				key: 'CAN_UPDATE_STAFF_PROFILE',
				name: 'Update Profile',
				description: 'Can update the details of a specific profile',
			},
			{
				key: 'CAN_DELETE_STAFF_PROFILE',
				name: 'Delete Profile',
				description: 'Can delete a specific profile',
			},
			{
				key: 'CAN_LIST_STAFF_PROFILE_PERMISSIONS',
				name: 'List Profile Permissions',
				description:
					'Can retrieve the list of permissions for a specific profile',
			},
			{
				key: 'CAN_CREATE_STAFF_PROFILE_PERMISSION',
				name: 'Create Profile Permission',
				description: 'Can create a new permission for a specific profile',
			},
			{
				key: 'CAN_GET_STAFF_PROFILE_PERMISSION',
				name: 'Get Profile Permission',
				description:
					'Can retrieve the details of a specific permission for a specific profile',
			},
			{
				key: 'CAN_UPDATE_STAFF_PROFILE_PERMISSION',
				name: 'Update Profile Permission',
				description:
					'Can update the details of a specific permission for a specific profile',
			},
		],
	},
];
