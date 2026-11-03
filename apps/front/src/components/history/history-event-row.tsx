import { IconExternalLink } from '@tabler/icons-react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { StatusPill } from '~/components/ui/product-page';

import {
	historyCategoryTone,
	historyActionPhraseKey,
	historyCategory,
	historyCategoryIcon,
	historyCategoryLabelKey,
	isSensitiveHistoryAction,
} from './history-actions';
import { historyTimeLabel } from './history-date';
import type { HistoryEvent } from './history-types';

/** The unknown-value convention (§4.1 item 11): « — », never a blank cell. */
const DASH = '—';

/** The target reference, shortened to what fits one row; the title carries the
 * whole identifier. */
const shortId = (value: string): string => value.slice(0, 8);

/**
 * One event line of the shared history (§5.1 « Par jour »): the actor's round
 * avatar, the sentence, the « Sensible » pill, the category pill, the IP, the
 * time, and « Ouvrir » on hover. Everything comes from the audit-log row; a
 * value the API does not carry is « — ».
 */
export const HistoryEventRow = ({
	event,
	locale,
	showOrganisation,
	onOpen,
	openLabel,
}: {
	event: HistoryEvent;
	locale: string;
	showOrganisation: boolean;
	onOpen: (event: HistoryEvent) => void;
	openLabel: (event: HistoryEvent) => string;
}) => {
	const { t, i18n } = useTranslation('common');
	const category = historyCategory(event.action);
	const phraseKey = historyActionPhraseKey(event.action);
	const phrase =
		phraseKey !== null && i18n.exists(phraseKey) ? t(phraseKey) : null;
	const actor = event.actorName ?? t('history-system');
	const isSystem = event.actorName === null;

	return (
		<li
			data-history-event={event.id}
			className="group/row flex min-h-12 items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-card focus-within:bg-card"
		>
			<PersonAvatar name={actor} system={isSystem} size="sm" />
			<p className="min-w-0 flex-1 truncate text-muted-foreground">
				<span className="font-medium text-foreground">{actor}</span>{' '}
				{phrase !== null ? (
					<span>{phrase}</span>
				) : (
					<span className="font-mono text-xs">{event.action ?? DASH}</span>
				)}
				{showOrganisation && event.organisationName ? (
					<span> · {event.organisationName}</span>
				) : null}
				{event.targetId ? (
					<span className="font-mono text-xs" title={event.targetId}>
						{' '}
						· {shortId(event.targetId)}
					</span>
				) : null}
			</p>
			{isSensitiveHistoryAction(event.action) ? (
				<StatusPill tone="danger">{t('history-sensitive')}</StatusPill>
			) : null}
			<StatusPill tone={historyCategoryTone(category)}>
				{createElement(historyCategoryIcon(category), {
					'aria-hidden': true,
					className: 'size-3',
				})}
				<span className="ml-1">{t(historyCategoryLabelKey(category))}</span>
			</StatusPill>
			<span className="hidden w-28 shrink-0 font-mono text-xs text-muted-foreground xl:inline">
				{event.ipAddress ?? DASH}
			</span>
			<time
				className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
				dateTime={event.at?.toISOString()}
			>
				{historyTimeLabel(event.at, locale)}
			</time>
			<Button
				variant="outline"
				className="h-7 shrink-0 gap-1 rounded-[var(--publy-radius-medium-control)] px-2.5 text-xs text-muted-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-foreground [&_svg]:size-3.5"
				onClick={() => onOpen(event)}
				aria-label={openLabel(event)}
			>
				<IconExternalLink aria-hidden="true" />
				{t('history-open')}
			</Button>
		</li>
	);
};
