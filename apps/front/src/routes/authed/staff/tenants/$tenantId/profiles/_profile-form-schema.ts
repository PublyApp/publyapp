import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { deriveTenantProfileCardStyle } from './_profile-card-style';

/**
 * Schema + value helpers for the tenant profile create form, extracted from
 * `_profile-form-drawer.tsx` so the owning page can build the same resolver
 * for its `useForm` call. Keeping them out of the drawer lets the owner own
 * the form state while the drawer stays presentation-only.
 */
export const buildProfileFormSchema = (t: (key: string) => string) =>
	z.object({
		name: z
			.string()
			.trim()
			.min(1, { message: t('profile-name-required') })
			.min(2, { message: t('profile-name-too-short') })
			.max(100, { message: t('profile-name-too-long') }),
		description: z
			.string()
			.trim()
			.max(500, { message: t('profile-description-too-long') })
			.optional(),
		icon: z.string().min(1),
		tone: z.string().min(1),
		permissionKeys: z.array(z.string()),
	});

export type ProfileFormValues = z.infer<
	ReturnType<typeof buildProfileFormSchema>
>;

export const PROFILE_FORM_FIELDS = [
	'name',
	'description',
	'icon',
	'tone',
	'permissionKeys',
] as const satisfies readonly (keyof ProfileFormValues)[];

export const isProfileFormField = (
	field: string,
): field is (typeof PROFILE_FORM_FIELDS)[number] =>
	PROFILE_FORM_FIELDS.some((candidate) => candidate === field);

export const toStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

export const getProfileFormValues = (): ProfileFormValues => {
	const style = deriveTenantProfileCardStyle('');

	return {
		name: '',
		description: '',
		icon: style.icon,
		tone: style.tone,
		permissionKeys: [],
	};
};

export const profileFormResolver = (t: (key: string) => string) =>
	zodResolver(buildProfileFormSchema(t));
