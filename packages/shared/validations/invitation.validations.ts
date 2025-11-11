import { MAX_PROFILES_PER_ACCOUNT } from '../lib/constants';
import type InterZod from '../lib/zod/InterZod';
import { getEmailFieldSchema } from './auth.validations';

export const getCreateInvitationSchema = (z: InterZod) => {
	return z.object({
		email: getEmailFieldSchema(z),
		profileIds: z
			.array(z.string().uuid(z.t('invalid-item', { item: z.t('profile') })))
			.min(1)
			.max(MAX_PROFILES_PER_ACCOUNT),
	});
};
