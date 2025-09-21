import './lib/parse/initParse';

import { functionName } from '@/shared/lib/constants';

import _ from 'lodash';
import { USE_MASTER_KEY } from './lib/constants';

const run = async () => {
	await Parse.Cloud.run(
		functionName.staff.staffMember.migrateIsStaffMember,
		null,
		USE_MASTER_KEY,
	);
	await Parse.Cloud.run(
		functionName.staff.staffMember.migrateRoleData,
		null,
		USE_MASTER_KEY,
	);
};

run();
