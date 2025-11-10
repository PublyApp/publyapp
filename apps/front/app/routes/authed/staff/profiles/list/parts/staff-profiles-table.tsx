import { RouterLink } from '@/front/components/router-link';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { v7 as uuidv7 } from 'uuid';

const StaffProfilesTable = () => {
	return (
		<div>
			<RouterLink href={FRONT_PATH_NAMES.staff.profiles.details(uuidv7()).root}>
				Go to profile details (template)
			</RouterLink>
		</div>
	);
};

export default StaffProfilesTable;
