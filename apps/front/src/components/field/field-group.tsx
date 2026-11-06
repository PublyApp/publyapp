import { type ReactNode } from 'react';
import { Label } from '~/components/ui/label';
import { cn } from '~/lib/utils';

/**
 * The prototype's grouped form rows (Shopkart OS `fields.tsx`): a bordered
 * group of `FieldRow`s, each with its label on the left and its control on
 * the right. The group is the `@container`: its rows (`.field-row` in
 * `app.css`) put the label beside the control, and above it once the group is
 * 480 px wide or less. `badge` follows the title, `note` is the line between
 * the title and the rows.
 */

const WITH_BADGE = 'flex flex-wrap items-center gap-x-2 gap-y-1';
const ROW =
	'field-row items-start gap-x-3 gap-y-1.5 border-b px-3.5 py-2.5 last:border-b-0';
const ROW_LABEL = cn(
	WITH_BADGE,
	'pt-2 text-[13px] leading-normal font-normal text-muted-foreground',
);
// The label's own text inside that box: the box's type, not the `Label` defaults.
const ROW_LABEL_TEXT = 'text-[13px] leading-normal font-normal';

export const FieldGroup = ({
	title,
	badge,
	note,
	children,
	className,
}: {
	title?: string;
	badge?: ReactNode;
	note?: ReactNode;
	children: ReactNode;
	className?: string;
}) => (
	<div className={cn('flex flex-col gap-2.5', className)}>
		{title ? (
			<p className={cn(WITH_BADGE, 'text-sm font-medium')}>
				{title}
				{badge}
			</p>
		) : null}
		{note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
		<div className="@container rounded-[var(--publy-radius-control)] border">
			{children}
		</div>
	</div>
);

/**
 * A label + field row of a `FieldGroup`. `htmlFor` points the label at the
 * control; `badge` follows the label, outside it: it is not part of the
 * field's accessible name, and a tap on it does not focus the field.
 */
export const FieldRow = ({
	label,
	badge,
	htmlFor,
	children,
}: {
	label: string;
	badge?: ReactNode;
	htmlFor?: string;
	children: ReactNode;
}) => (
	<div className={ROW}>
		<div className={ROW_LABEL}>
			{htmlFor ? (
				<Label htmlFor={htmlFor} className={ROW_LABEL_TEXT}>
					{label}
				</Label>
			) : (
				<span className={ROW_LABEL_TEXT}>{label}</span>
			)}
			{badge}
		</div>
		<div className="flex min-w-0 flex-col gap-1.5">{children}</div>
	</div>
);

/** A `FieldGroup` row whose content is not one labelled input (a segmented
 * control, a set of checkboxes, a drop zone). */
export const GroupRow = ({
	label,
	badge,
	children,
}: {
	label: string;
	badge?: ReactNode;
	children: ReactNode;
}) => (
	<div className={ROW}>
		<span className={ROW_LABEL}>
			<span className={ROW_LABEL_TEXT}>{label}</span>
			{badge}
		</span>
		<div className="flex min-w-0 flex-col gap-1.5">{children}</div>
	</div>
);
