import { z } from 'zod';

const ACCOUNT_LEVEL_OPTIONS = ['Admin', 'User'] as const;
const STATUS_OPTIONS = ['Active', 'Suspended'] as const;
const ALLOWED_AVATAR_URL_PROTOCOLS = ['http:', 'https:'];

export { ACCOUNT_LEVEL_OPTIONS, STATUS_OPTIONS };

export type AccountLevelOption = (typeof ACCOUNT_LEVEL_OPTIONS)[number];
export type StatusOption = (typeof STATUS_OPTIONS)[number];

export const getStaffUserEditSchema = (t: (key: string) => string) =>
	z.object({
		firstName: z.string().trim().max(128).optional(),
		lastName: z.string().trim().max(128).optional(),
		avatarUrl: z
			.string()
			.trim()
			.max(1024)
			.refine((value) => {
				if (!value) {
					return true;
				}

				try {
					return ALLOWED_AVATAR_URL_PROTOCOLS.includes(new URL(value).protocol);
				} catch {
					return false;
				}
			}, t('staff-users:invalid-url')),
		email: z.string().trim().pipe(z.email()).or(z.literal('')),
		accountLevel: z.enum(ACCOUNT_LEVEL_OPTIONS),
		status: z.enum(STATUS_OPTIONS),
		profileIds: z.array(z.string()),
	});

export type StaffUserEditValues = z.infer<
	ReturnType<typeof getStaffUserEditSchema>
>;

export const normalizeAccountLevel = (
	value: string | null,
): StaffUserEditValues['accountLevel'] =>
	value === 'Admin' ? 'Admin' : 'User';

export const normalizeStatus = (
	value: string | null,
): StaffUserEditValues['status'] =>
	value === 'Suspended' ? 'Suspended' : 'Active';

export const PROFILE_PAGE_SIZE = 20;
