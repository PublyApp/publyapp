import { MAX_ROLES_PER_ACCOUNT } from '../lib/constants';
import type { ZodI18n } from '../lib/zod/zod-i18n';
import { getEmailFieldSchema } from './auth.validations';

export const getCreateInvitationSchema = (z: ZodI18n) => {
	return z.object({
		email: getEmailFieldSchema(z),
		roleIds: z
			.array(z.uuid(z.t('invalid-item', { item: z.t('role') })))
			.min(1)
			.max(MAX_ROLES_PER_ACCOUNT),
	});
};

export const getBulkCreateInvitationsSchema = (z: ZodI18n) => {
	return z
		.object({
			invitations: z
				.array(
					z.object({
						// Trim whitespace from email to normalize before validation
						email: getEmailFieldSchema(z).trim(),
						roleIds: z
							.array(z.uuid(z.t('invalid-item', { item: z.t('role') })))
							.min(1, z.t('at-least-one-role-required'))
							.max(MAX_ROLES_PER_ACCOUNT),
					}),
				)
				.min(1, z.t('at-least-one-invitation-required')),
		})
		.superRefine((data, ctx) => {
			// Check for duplicate emails across invitations
			const emails = data.invitations.map((inv) => inv.email.toLowerCase());
			const seen = new Set<string>();
			const duplicateIndices: number[] = [];

			for (let i = 0; i < emails.length; i++) {
				const email = emails[i];
				if (seen.has(email)) {
					duplicateIndices.push(i);
				} else {
					seen.add(email);
					// Check if this email appears later (mark first occurrence too)
					const firstIndex = emails.indexOf(email);
					if (emails.lastIndexOf(email) !== firstIndex) {
						duplicateIndices.push(firstIndex);
					}
				}
			}

			// Add error to each duplicate email field
			const uniqueDuplicates = [...new Set(duplicateIndices)];
			for (const index of uniqueDuplicates) {
				ctx.addIssue({
					code: 'custom',
					message: z.t('duplicate-email'),
					path: ['invitations', index, 'email'],
				});
			}

			// Check for duplicate role IDs within each invitation
			for (let i = 0; i < data.invitations.length; i++) {
				const roleIds = data.invitations[i].roleIds;
				const uniqueIds = new Set(roleIds);
				if (uniqueIds.size !== roleIds.length) {
					ctx.addIssue({
						code: 'custom',
						message: z.t('duplicate-role', {
							defaultValue: 'Duplicate role selected',
						}),
						path: ['invitations', i, 'roleIds'],
					});
				}
			}
		});
};

export const getAcceptInvitationSchema = (z: ZodI18n) => {
	return z
		.object({
			firstName: z
				.string()
				.min(1, z.t('first-name-required'))
				.max(100)
				.optional(),
			lastName: z
				.string()
				.min(1, z.t('name-must-be-at-least-2-characters'))
				.max(100),
			password: z
				.string()
				.min(12, z.t('at-least-12-chars-and-1-special-char'))
				.max(255),
			confirmPassword: z.string(),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: z.t('passwords-do-not-match'),
			path: ['confirmPassword'],
		});
};
