import { DEFAULT_MAX_USER_PER_TENANT } from '@org/shared-ts/lib/constants';
import type { ZodI18n } from '@org/shared-ts/lib/zod/zod-i18n';

import { getFileSchemaClientSide } from '../file/file-client.validations';
import { getNewTenantSchemaServerSide } from './tenant.validations';

export const getNewTenantSchemaClientSide = (
	z: ZodI18n,
	options: { maxUsers?: number } = { maxUsers: DEFAULT_MAX_USER_PER_TENANT },
) => {
	return getNewTenantSchemaServerSide(z, options).extend({
		logo: getFileSchemaClientSide(z).or(z.string()).optional(),
	});
};
