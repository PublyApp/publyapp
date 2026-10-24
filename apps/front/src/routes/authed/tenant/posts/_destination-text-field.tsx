import { useTranslation } from 'react-i18next';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import { useTextCounter } from '~/lib/text-counter/use-text-counter';

import { PublishLimitCounter } from './_publish-limit-counter';
import type { SelectedDestination } from './_use-publish-selection';

const NO_DESTINATIONS: SelectedDestination[] = [];

/** One text field of a destination's tab: an override toggle, the inherited
 * shared text while it is off, an editable copy while it is on, and a counter
 * measured against THIS destination's limits only (so two tabs never share a
 * counter). Turning the toggle on starts from the inherited text. */
export const DestinationTextField = ({
	fieldId,
	label,
	inherited,
	value,
	destination,
	onChange,
}: {
	fieldId: string;
	label: string;
	/** The shared text this destination inherits. */
	inherited: string;
	/** The customized text, or undefined while the field inherits. */
	value: string | undefined;
	/** Null when the server advertised no limits for the destination. */
	destination: SelectedDestination | null;
	/** `undefined` returns the field to inheriting the shared text. */
	onChange: (next: string | undefined) => void;
}) => {
	const { t } = useTranslation(['posts']);
	const isCustomized = value !== undefined;
	const tightest = useTextCounter(
		value ?? inherited,
		destination ? [destination] : NO_DESTINATIONS,
	);
	const switchId = `${fieldId}-override`;

	return (
		<div
			className="space-y-2"
			data-testid="tenant-posts-destination-text-field"
			data-customized={isCustomized ? 'true' : undefined}
		>
			<div className="flex items-center justify-between gap-3">
				<Label htmlFor={isCustomized ? fieldId : undefined}>{label}</Label>
				<div className="flex items-center gap-2">
					<label htmlFor={switchId} className="publy-type-helper">
						{t('posts:destination-override-text')}
					</label>
					<Switch
						id={switchId}
						size="sm"
						checked={isCustomized}
						aria-label={t('posts:destination-override-text-aria', { label })}
						data-testid="tenant-posts-destination-text-toggle"
						onCheckedChange={(checked) =>
							onChange(checked ? inherited : undefined)
						}
					/>
				</div>
			</div>
			{isCustomized ? (
				<Textarea
					id={fieldId}
					rows={4}
					value={value}
					data-testid="tenant-posts-destination-text"
					onChange={(event) => onChange(event.target.value)}
				/>
			) : (
				<div className="space-y-1">
					<p
						className="publy-type-helper text-muted-foreground"
						data-testid="tenant-posts-destination-inherited"
					>
						{t('posts:destination-inherited')}
					</p>
					<p className="max-h-24 overflow-auto rounded-[var(--publy-radius-medium-control)] bg-(--publy-surface-muted) px-3 py-2 text-[13px] whitespace-pre-wrap text-muted-foreground">
						{inherited}
					</p>
				</div>
			)}
			<PublishLimitCounter tightest={tightest} />
		</div>
	);
};
