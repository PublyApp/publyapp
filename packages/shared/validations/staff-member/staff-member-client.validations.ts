import type InterZod from '@/shared/lib/zod/InterZod';
import { getFileSchemaClientSide } from '../file/file-client.validations';
import { getNewStaffMemberSchemaServerSide } from './staff-member.validation';

export const getNewStaffMemberSchemaClientSide = (z: InterZod) => {
	return getNewStaffMemberSchemaServerSide(z).extend({
		avatar: getFileSchemaClientSide(z).or(z.string()).optional(),
	});
};
