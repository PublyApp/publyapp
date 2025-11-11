import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import StaffProfileBasicInfos from './parts/staff-profile-basic-infos';
import StaffProfilePermissions from './parts/staff-profile-permissions';
import StaffProfileSidebar from './parts/staff-profile-sidebar';

const StaffProfileDetailsBasicsTabPage = () => {
	return (
		<Grid container spacing={3}>
			<Grid size={{ md: 3 }} display={{ xs: 'none', md: 'block' }}>
				<StaffProfileSidebar />
			</Grid>

			<Grid size={{ xs: 12, md: 8 }}>
				<Stack spacing={5}>
					<StaffProfileBasicInfos />
					<StaffProfilePermissions />
				</Stack>
			</Grid>
		</Grid>
	);
};

export default StaffProfileDetailsBasicsTabPage;
