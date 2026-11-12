import { IconAlertCircle } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedDateInput } from '~/components/localized-date-input';
import { LocalizedTimeInput } from '~/components/localized-time-input';
import { Button } from '~/components/ui/button';

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
	const dateErrorId = useId();
	const timeErrorId = useId();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const value =
		!isDateInvalid && !isTimeInvalid && date !== undefined && time !== undefined
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
		<div className="space-y-2" data-testid="tenant-posts-schedule-row">
			<span id={labelId} className="block text-[13px] leading-none font-medium">
				{t('posts:schedule-label')}
			</span>
			<div
				role="group"
				aria-labelledby={labelId}
				className="grid grid-cols-2 gap-2"
			>
				<LocalizedDateInput
					locale={locale}
					ariaLabel={t('common:date')}
					errorMessage={t('common:invalid-date')}
					errorId={dateErrorId}
					hideError
					testId="tenant-posts-schedule-date"
					value={date}
					onChange={(next) => {
						setDate(next);
						setIsDateInvalid(false);
						setIsPast(false);
					}}
					onInvalid={() => setIsDateInvalid(true)}
				/>
				<LocalizedTimeInput
					locale={locale}
					ariaLabel={t('posts:schedule-time-label')}
					errorMessage={t('posts:schedule-time-invalid')}
					errorId={timeErrorId}
					hideError
					testId="tenant-posts-schedule-time"
					value={time}
					onChange={(next) => {
						setTime(next);
						setIsTimeInvalid(false);
						setIsPast(false);
					}}
					onInvalid={() => setIsTimeInvalid(true)}
				/>
			</div>
			{isDateInvalid || isTimeInvalid ? (
				<p
					id={isDateInvalid ? dateErrorId : timeErrorId}
					className="publy-field-error"
					role="alert"
				>
					<IconAlertCircle aria-hidden="true" />
					{isDateInvalid
						? t('common:invalid-date')
						: t('posts:schedule-time-invalid')}
				</p>
			) : null}
			<Button
				type="button"
				variant="outline"
				className="w-full"
				disabled={disabled || value === ''}
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
