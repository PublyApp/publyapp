import type { TablerIcon } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/** The nine Shopkart history categories, plus a neutral bucket for an action
 * the front does not know yet (a new backend registry entry). */
export type HistoryCategory =
	| 'auth'
	| 'tenant'
	| 'member'
	| 'staff'
	| 'impersonation'
	| 'invitation'
	| 'job'
	| 'content'
	| 'system'
	| 'other';

/**
 * One row of the shared history (§5.1). The four surfaces that read it — the
 * audit log, the dashboard activity, an organisation's activity and a member's
 * activity — all feed the same audit-log-shaped data, so one normalised type
 * keeps the feed honest: every field here is a field the API actually returns.
 */
export type HistoryEvent = {
	id: string;
	/** The event's instant, or `null` when the row carries none. */
	at: Date | null;
	/** `null` is the system: the API returns no user for a machine event. */
	actorName: string | null;
	/** The technical audit action key (`tenant.suspended`). */
	action: string | null;
	ipAddress: string | null;
	targetId: string | null;
	/** An optional organisation label, when the caller already knows it. */
	organisationName?: string | null;
	/** The event's object, when the caller can resolve its id (the audit list
	 * carries only `targetId`). The row then uses the phrase's `-target`
	 * variant (« a suspendu Vanilla Coast »). */
	targetName?: string | null;
	/** Events this one caused, listed right under it. */
	children?: readonly HistoryEvent[];
};

/** One filter value; `count` is `null` when the API exposes no facet count. */
type HistoryFilterChoice = {
	value: string;
	label: string;
	icon?: ReactNode;
	count?: number | null;
};

/**
 * One filter of the history toolbar. Server-side filters (the audit log) leave
 * every `count` at `null` — the feed never turns a loaded page into a facet
 * count (§2.8).
 */
export type HistoryFilter = {
	key: string;
	label: string;
	icon: TablerIcon;
	choices: readonly HistoryFilterChoice[];
	/** Also listed as a shortcut group in the side panel. */
	panel?: boolean;
};
