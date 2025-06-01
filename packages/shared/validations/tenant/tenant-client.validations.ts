import type InterZod from '@/shared/lib/zod/InterZod';
import { getFileSchemaClientSide } from '../file/file-client.validations';
import { getNewTenantSchemaServerSide } from './tenant.validations';
import { DEFAULT_MAX_USER_PER_TENANT } from '@/shared/lib/constants';
export const getNewTenantSchemaClientSide = (
	z: InterZod,
	options: { maxUsers?: number } = { maxUsers: DEFAULT_MAX_USER_PER_TENANT },
) => {
	return getNewTenantSchemaServerSide(z, options).extend({
		logo: getFileSchemaClientSide(z).optional(),
	});
};
