import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

/** "Schedule for": one date and time in the viewer's zone, applied to every
 * selected destination (the "same time for all" default). */
export const PublishScheduleRow = ({
	disabled,
	onSchedule,
}: {
	disabled: boolean;
	onSchedule: (at: Date) => void;
}) => {
	const { t } = useTranslation(['posts']);
	const [value, setValue] = useState('');
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
			<Label htmlFor="post-schedule-at">{t('posts:schedule-label')}</Label>
			<div className="flex flex-wrap items-center gap-2">
				<Input
					id="post-schedule-at"
					type="datetime-local"
					value={value}
					className="md:w-56"
					data-testid="tenant-posts-schedule-at"
					onChange={(event) => {
						setValue(event.target.value);
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
