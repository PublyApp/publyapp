import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedDateInput } from '~/components/localized-date-input';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

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
	const [time, setTime] = useState('');
	// The field refused what was typed: `date` is then the previous, stale value.
	const [isDateInvalid, setIsDateInvalid] = useState(false);
	const value =
		!isDateInvalid && date !== undefined && time !== ''
			? `${date}T${time}`
			: '';
	const [isPast, setIsPast] = useState(false);

	const submit = () => {
		const at = new Date(value);
		if (Number.isNaN(at.valueOf()) || at.valueOf() <= Date.now()) {
			setIsPast(true);
			return;
		}
		setIsPast(false);
		onSchedule(at);
	};

	return (
		<div className="space-y-1" data-testid="tenant-posts-schedule-row">
			<Label htmlFor="post-schedule-time">{t('posts:schedule-label')}</Label>
			<div className="flex flex-wrap items-center gap-2">
				<LocalizedDateInput
					locale={i18n.resolvedLanguage ?? i18n.language}
					ariaLabel={t('common:date')}
					errorMessage={t('common:invalid-date')}
					testId="tenant-posts-schedule-date"
					value={date}
					className="md:w-36"
					onChange={(next) => {
						setDate(next);
						setIsDateInvalid(false);
						setIsPast(false);
					}}
					onInvalid={() => setIsDateInvalid(true)}
				/>
				<Input
					id="post-schedule-time"
					type="time"
					aria-label={t('posts:schedule-time-label')}
					value={time}
					className="md:w-32"
					data-testid="tenant-posts-schedule-time"
					onChange={(event) => {
						setTime(event.target.value);
						setIsPast(false);
					}}
				/>
				<Button
					type="button"
					variant="outline"
					disabled={disabled || value === ''}
					data-testid="tenant-posts-schedule-submit"
					onClick={submit}
				>
					{t('posts:schedule-submit')}
				</Button>
			</div>
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
