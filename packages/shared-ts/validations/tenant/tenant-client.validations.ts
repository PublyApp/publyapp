import { DEFAULT_MAX_USER_PER_TENANT } from '@org/shared-ts/lib/constants';
import type InterZod from '@org/shared-ts/lib/zod/InterZod';

import { getFileSchemaClientSide } from '../file/file-client.validations';
import { getNewTenantSchemaServerSide } from './tenant.validations';

export const getNewTenantSchemaClientSide = (
	z: InterZod,
	options: { maxUsers?: number } = { maxUsers: DEFAULT_MAX_USER_PER_TENANT },
) => {
	return getNewTenantSchemaServerSide(z, options).extend({
		logo: getFileSchemaClientSide(z).or(z.string()).optional(),
	});
};
