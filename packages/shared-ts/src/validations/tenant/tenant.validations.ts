import {
	ACCOUNT_LEVEL_ENUM,
	DEFAULT_MAX_USER_PER_TENANT,
} from '@org/shared-ts/lib/constants';
import type InterZod from '@org/shared-ts/lib/zod/InterZod';

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
					email: z.email(),
					accountLevel: z.enum([
						ACCOUNT_LEVEL_ENUM.ADMIN,
						ACCOUNT_LEVEL_ENUM.USER,
					]),
				}),
			)
			.min(1)
			.max(options.maxUsers || DEFAULT_MAX_USER_PER_TENANT)
			// verify email is unique
			.refine(
				(users) => {
					const emails = users.map((user) => user.email);
					return new Set(emails).size === emails.length;
				},
				{
					message: z.t('each-user-must-have-a-unique-email'),
				},
			)
			// at least one admin
			.refine(
				(users) => {
					return users.some((user) => user.accountLevel === 'Admin');
				},
				{
					message: z.t('tenant-should-have-at-least-one-admin'),
				},
			),
	});
};
