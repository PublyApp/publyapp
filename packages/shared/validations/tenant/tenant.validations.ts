import { DEFAULT_MAX_USER_PER_TENANT } from '@/shared/lib/constants';
import type InterZod from '@/shared/lib/zod/InterZod';

export const getNewTenantSchemaServerSide = (
	z: InterZod,
	options: { maxUsers?: number } = { maxUsers: DEFAULT_MAX_USER_PER_TENANT },
) => {
	return z.object({
		name: z.string().min(5),
		initialUsers: z
			.array(z.string().email())
			.min(1)
			.max(options.maxUsers || DEFAULT_MAX_USER_PER_TENANT),
	});
};
