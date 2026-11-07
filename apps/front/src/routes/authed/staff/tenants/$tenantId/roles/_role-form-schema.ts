import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { deriveTenantRoleCardStyle } from './_role-card-style';

/**
 * Schema + value helpers for the tenant role create form, extracted from
 * `_role-form-drawer.tsx` so the owning page can build the same resolver
 * for its `useForm` call. Keeping them out of the drawer lets the owner own
 * the form state while the drawer stays presentation-only.
 */
const buildRoleFormSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: t('role-name-required') })
			.min(2, { message: t('role-name-too-short') })
			.max(100, { message: t('role-name-too-long') }),
		description: z
			.string()
			.trim()
			.max(500, { message: t('role-description-too-long') })
			.optional(),
		icon: z.string().min(1),
		tone: z.string().min(1),
		permissionKeys: z.array(z.string()),
	});

export type RoleFormValues = z.infer<ReturnType<typeof buildRoleFormSchema>>;

export const ROLE_FORM_FIELDS = [
	'name',
	'description',
	'icon',
	'tone',
	'permissionKeys',
] as const satisfies readonly (keyof RoleFormValues)[];

export const isRoleFormField = (
	field: string,
): field is (typeof ROLE_FORM_FIELDS)[number] =>
	ROLE_FORM_FIELDS.some((candidate) => candidate === field);

export const toStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

export const getRoleFormValues = (): RoleFormValues => {
	const style = deriveTenantRoleCardStyle('');

	return {
		name: '',
		description: '',
		icon: style.icon,
		tone: style.tone,
		permissionKeys: [],
	};
};

export const roleFormResolver = (t: (key: string) => string) =>
	zodResolver(buildRoleFormSchema(t));
