import { IconCircle, IconCircleCheckFilled } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { Controller } from 'react-hook-form';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '~/components/ui/select';
import { cn } from '~/lib/utils';

import { AccountLevelObject } from '@org/client-ts/models/index';

import { getUserLevel } from './_tenants-new-schema';
import {
	USER_ROLE_OPTIONS,
	type NewTenantAccountLevel,
} from './_tenants-new-types';

/** Compact select styled as the honesty-override "Admin → amber, User →
 * neutral" chip (reuses the same tone classes as the Users-tab role chip). */
export const MemberLevelSelect = ({
	name,
	value,
	onChange,
	onBlur,
	disabled,
	ariaLabel,
	t,
}: {
	name: string;
	value: NewTenantAccountLevel;
	onChange: (value: NewTenantAccountLevel) => void;
	onBlur: () => void;
	disabled?: boolean;
	ariaLabel: string;
	t: (key: string) => string;
}) => (
	<Select
		id={name}
		aria-label={ariaLabel}
		value={value}
		onValueChange={(nextValue) => {
			if (typeof nextValue === 'string') {
				onChange(getUserLevel(nextValue));
			}
		}}
		disabled={disabled}
	>
		<SelectTrigger
			onBlur={onBlur}
			size="sm"
			className={cn(
				'w-full justify-center gap-1 border px-2 text-[11px] font-medium shadow-none',
				value === AccountLevelObject.Admin
					? 'border-(--publy-chip-pending-border) bg-(--publy-chip-pending-bg) text-(--publy-chip-pending-text)'
					: 'border-border bg-background text-foreground',
			)}
		>
			<span data-slot="select-value">
				{value === AccountLevelObject.Admin ? t('admin') : t('user')}
			</span>
		</SelectTrigger>
		<SelectContent>
			{USER_ROLE_OPTIONS.map((option) => (
				<SelectItem key={option} value={option}>
					{option === AccountLevelObject.Admin ? t('admin') : t('user')}
				</SelectItem>
			))}
		</SelectContent>
	</Select>
);

export const ChecklistRow = ({
	checked,
	tone = 'default',
	children,
	testId,
}: {
	checked: boolean;
	tone?: 'default' | 'warning';
	children: ReactNode;
	testId: string;
}) => (
	<li
		className="flex items-start gap-2 text-xs"
		data-testid={testId}
		data-checked={checked}
	>
		{checked ? (
			<IconCircleCheckFilled
				aria-hidden="true"
				className="mt-px size-3.5 shrink-0 text-(--publy-success)"
			/>
		) : (
			<IconCircle
				aria-hidden="true"
				className={cn(
					'mt-px size-3.5 shrink-0',
					tone === 'warning'
						? 'text-(--publy-danger)'
						: 'text-muted-foreground',
				)}
			/>
		)}
		<span
			className={tone === 'warning' && !checked ? 'text-(--publy-danger)' : ''}
		>
			{children}
		</span>
	</li>
);

/** Workspace slug field: a muted `publyapp.com/` prefix + mono slug input
 * inside a single bordered container, matching the design's path-segment
 * treatment. Optional — an empty value lets the server generate a code. */
export const SlugField = ({
	isDisabled,
	label,
	hint,
	t,
}: {
	isDisabled?: boolean;
	label: string;
	hint: string;
	t: (key: string) => string;
}) => {
	const fieldId = 'tenant-create-code';
	const helperId = `${fieldId}-helper`;

	return (
		<Controller
			name="code"
			render={({ field, fieldState: { error } }) => (
				<div className="space-y-1.5">
					<label
						htmlFor={fieldId}
						className="flex items-center gap-2 text-[13px] leading-none font-medium"
					>
						{label}
					</label>
					<div
						className={cn(
							'flex h-9 items-center gap-0 rounded-[var(--publy-radius-input)] border border-border bg-input/35 px-3.5 shadow-[var(--publy-shadow-input)]',
							error && 'border-destructive',
						)}
					>
						<span className="shrink-0 font-mono text-[13px] text-muted-foreground">
							publyapp.com/
						</span>
						<input
							id={fieldId}
							aria-label={label}
							aria-invalid={Boolean(error) || undefined}
							aria-describedby={helperId}
							className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-muted-foreground"
							value={field.value}
							onChange={(event) => {
								field.onChange(event.target.value);
							}}
							onBlur={field.onBlur}
							disabled={isDisabled}
							autoComplete="off"
							placeholder={t('assigned-after-creation')}
						/>
					</div>
					<p
						id={helperId}
						data-slot={error ? 'field-error' : 'field-helper'}
						className={error ? 'publy-field-error' : 'publy-field-helper'}
					>
						{error?.message ?? hint}
					</p>
				</div>
			)}
		/>
	);
};
