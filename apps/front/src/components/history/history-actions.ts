import {
	IconBuilding,
	IconFileSearch,
	IconKey,
	IconMail,
	IconMask,
	IconSend,
	IconSettingsAutomation,
	IconShieldLock,
	IconSpeakerphone,
	IconUsers,
	type Icon,
} from '@tabler/icons-react';

import type { HistoryCategory } from './history-types';

/** Each category's pill tone (only Organisation and Impersonation are tinted,
 * as in the reference). A `Map`, not an object literal: the category id `content`
 * is a definite-copy property name and would trip the i18n literal guard. */
const CATEGORY_TONES = new Map<HistoryCategory, 'neutral' | 'info' | 'warning'>(
	[
		['auth', 'neutral'],
		['tenant', 'info'],
		['member', 'neutral'],
		['staff', 'neutral'],
		['impersonation', 'warning'],
		['invitation', 'neutral'],
		['job', 'neutral'],
		['content', 'neutral'],
		['system', 'neutral'],
		['other', 'neutral'],
	],
);

export const historyCategoryTone = (
	category: HistoryCategory,
): 'neutral' | 'info' | 'warning' => CATEGORY_TONES.get(category) ?? 'neutral';

/** Display order of the category filter and its panel group (§5.1). */
export const HISTORY_CATEGORIES: readonly HistoryCategory[] = [
	'auth',
	'tenant',
	'member',
	'staff',
	'impersonation',
	'invitation',
	'job',
	'content',
	'system',
	'other',
];

const CATEGORY_ICONS = {
	auth: IconKey,
	tenant: IconBuilding,
	member: IconUsers,
	staff: IconShieldLock,
	impersonation: IconMask,
	invitation: IconMail,
	job: IconSettingsAutomation,
	content: IconSend,
	system: IconSpeakerphone,
	other: IconFileSearch,
} satisfies Record<HistoryCategory, Icon>;

export const historyCategoryIcon = (category: HistoryCategory): Icon =>
	CATEGORY_ICONS[category];

export const historyCategoryLabelKey = (category: HistoryCategory): string =>
	`history-category-${category}`;

/** Longest prefix wins, so `tenant.profile.user.*` is a membership event while
 * `tenant.profile.*` stays an organisation event. */
const CATEGORY_PREFIXES: readonly (readonly [string, HistoryCategory])[] = [
	['auth.', 'auth'],
	['impersonation.', 'impersonation'],
	['invitation.', 'invitation'],
	['tenant.invitation.', 'invitation'],
	['tenant.profile.user.', 'member'],
	['tenant.user.', 'member'],
	['tenant.profile.', 'tenant'],
	['tenant.', 'tenant'],
	['staff.', 'staff'],
	['job.', 'job'],
	['post.', 'content'],
	['publication.', 'content'],
	['socialaccount.', 'content'],
	['upload.', 'content'],
	['system.', 'system'],
];

export const historyCategory = (action: string | null): HistoryCategory => {
	const normalized = action?.trim() ?? '';
	for (const [prefix, category] of CATEGORY_PREFIXES) {
		if (normalized.startsWith(prefix)) {
			return category;
		}
	}
	return 'other';
};

/**
 * The prototype's « Sensible » rule (§5.1): suspensions, impersonations and
 * refused logins. Derived from the key so a bulk variant added backend-side is
 * covered without a front change.
 */
export const isSensitiveHistoryAction = (action: string | null): boolean => {
	const normalized = action?.trim().toLowerCase() ?? '';
	if (normalized.length === 0) {
		return false;
	}
	return (
		normalized.endsWith('.suspended') ||
		normalized.startsWith('impersonation.') ||
		normalized === 'auth.login.failed'
	);
};

/** The phrase catalog is keyed by the action key (`tenant.suspended` →
 * `history-action-tenant-suspended`). `null` means a technical key with no
 * phrase: the row then shows the key itself rather than inventing a sentence. */
export const historyActionPhraseKey = (
	action: string | null,
): string | null => {
	const normalized = action?.trim() ?? '';
	if (normalized.length === 0) {
		return null;
	}
	return `history-action-${normalized.replaceAll('.', '-')}`;
};
