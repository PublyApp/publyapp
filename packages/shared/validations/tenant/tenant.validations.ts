import {
	DEFAULT_MAX_USER_PER_TENANT,
	tenantSubRoleNames,
} from '@/shared/lib/constants';
import type InterZod from '@/shared/lib/zod/InterZod';

export const getNewTenantSchemaServerSide = (
	z: InterZod,
	options: { maxUsers?: number } = { maxUsers: DEFAULT_MAX_USER_PER_TENANT },
) => {
	return z.object({
		name: z.string().min(5),
		maxUsers: z
			.number()
			.min(1)
			.max(options.maxUsers || DEFAULT_MAX_USER_PER_TENANT),
		initialUsers: z
			.array(
				z.object({
					email: z.string().email(),
					role: z.enum(tenantSubRoleNames),
				}),
			)
			.min(1)
			.max(options.maxUsers || DEFAULT_MAX_USER_PER_TENANT),
	});
};
