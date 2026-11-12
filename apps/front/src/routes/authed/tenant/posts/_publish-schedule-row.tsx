import { IconAlertCircle } from '@tabler/icons-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedDateInput } from '~/components/localized-date-input';
import { LocalizedTimeInput } from '~/components/localized-time-input';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { parseLocalizedDate } from '~/lib/dates/localized-date';
import { parseLocalizedTime } from '~/lib/dates/localized-time';

type Draft = { text: string; locale: string };

const scheduleMessage = (
	t: (key: string) => string,
	flags: {
		isDateInvalid: boolean;
		isTimeInvalid: boolean;
		isIncomplete: boolean;
	},
): string | null => {
	if (flags.isDateInvalid && flags.isTimeInvalid) {
		return t('posts:schedule-both-invalid');
	}
	if (flags.isDateInvalid) {
		return t('common:invalid-date');
	}
	if (flags.isTimeInvalid) {
		return t('posts:schedule-time-invalid');
	}
	return flags.isIncomplete ? t('posts:schedule-incomplete') : null;
};

/** "Schedule for": one date and time in the viewer's zone, applied to every
 * selected destination (the "same time for all" default). The date follows the
 * UI language (a native date input follows the browser's instead, #2410). */
export const PublishScheduleRow = ({
	disabled,
	onSchedule,
}: {
	disabled: boolean;
	onSchedule: (at: Date) => void;
}) => {
	const { t, i18n } = useTranslation(['posts', 'common']);
	const [date, setDate] = useState<string | undefined>(undefined);
	const [time, setTime] = useState<string | undefined>(undefined);
	// A field refused what was typed: its value is then the previous, stale one.
	const [isDateInvalid, setIsDateInvalid] = useState(false);
	const [isTimeInvalid, setIsTimeInvalid] = useState(false);
	const labelId = useId();
	const errorId = useId();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	// Typed text not yet committed. A click that does not blur the field
	// (screen reader, voice control) must still schedule what the field shows,
	// so submit reads these. Pinned to the locale: a locale change remounts the
	// fields and drops their text.
	const dateDraft = useRef<Draft | null>(null);
	const timeDraft = useRef<Draft | null>(null);
	const [isIncomplete, setIsIncomplete] = useState(false);
	const [isPast, setIsPast] = useState(false);
	const draftText = (draft: Draft | null): string | null =>
		draft !== null && draft.locale === locale ? draft.text : null;

	const submit = () => {
		const dateText = draftText(dateDraft.current);
		const timeText = draftText(timeDraft.current);
		const dateValue =
			dateText === null ? date : parseLocalizedDate(dateText, locale);
		const timeValue = timeText === null ? time : parseLocalizedTime(timeText);
		const dateBad = dateText === null ? isDateInvalid : dateValue === undefined;
		const timeBad = timeText === null ? isTimeInvalid : timeValue === undefined;
		setIsDateInvalid(dateBad);
		setIsTimeInvalid(timeBad);
		if (dateBad || timeBad) {
			return;
		}
		if (!dateValue || !timeValue) {
			setIsIncomplete(true);
			return;
		}
		setIsIncomplete(false);
		const at = new Date(`${dateValue}T${timeValue}`);
		if (Number.isNaN(at.valueOf()) || at.valueOf() <= Date.now()) {
			setIsPast(true);
			return;
		}
		setIsPast(false);
		onSchedule(at);
	};

	const message = scheduleMessage(t, {
		isDateInvalid,
		isTimeInvalid,
		isIncomplete,
	});

	return (
		<div className="space-y-2" data-testid="tenant-posts-schedule-row">
			<Label id={labelId}>{t('posts:schedule-label')}</Label>
			<div
				role="group"
				aria-labelledby={labelId}
				className="grid grid-cols-2 gap-2"
			>
				<LocalizedDateInput
					locale={locale}
					ariaLabel={t('common:date')}
					errorMessage={t('common:invalid-date')}
					errorId={errorId}
					hideError
					invalid={isDateInvalid}
					testId="tenant-posts-schedule-date"
					value={date}
					onChange={(next) => {
						setDate(next);
						setIsDateInvalid(false);
						setIsIncomplete(false);
						setIsPast(false);
					}}
					onInvalid={() => setIsDateInvalid(true)}
					onDraftChange={(text) => {
						dateDraft.current = text === null ? null : { text, locale };
					}}
				/>
				<LocalizedTimeInput
					locale={locale}
					ariaLabel={t('posts:schedule-time-label')}
					errorMessage={t('posts:schedule-time-invalid')}
					errorId={errorId}
					hideError
					invalid={isTimeInvalid}
					testId="tenant-posts-schedule-time"
					value={time}
					onChange={(next) => {
						setTime(next);
						setIsTimeInvalid(false);
						setIsIncomplete(false);
						setIsPast(false);
					}}
					onInvalid={() => setIsTimeInvalid(true)}
					onDraftChange={(text) => {
						timeDraft.current = text === null ? null : { text, locale };
					}}
				/>
			</div>
			{message === null ? null : (
				<p id={errorId} className="publy-field-error" role="alert">
					<IconAlertCircle aria-hidden="true" />
					{message}
				</p>
			)}
			<Button
				type="button"
				variant="outline"
				className="w-full"
				disabled={disabled}
				data-testid="tenant-posts-schedule-submit"
				onClick={submit}
			>
				{t('posts:schedule-submit')}
			</Button>
			{isPast ? (
				<p
					className="text-xs text-[var(--publy-danger)]"
					role="alert"
					data-testid="tenant-posts-schedule-past"
				>
					{t('posts:schedule-past')}
				</p>
			) : null}
		</div>
	);
};
