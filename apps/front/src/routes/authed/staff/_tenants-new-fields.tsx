import { IconCircle, IconCircleCheckFilled } from '@tabler/icons-react';
import { useId, type ReactNode } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { FieldRow } from '~/components/field/field-group';
import { CodeSelect } from '~/components/ui/code-select';
import { Input } from '~/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';

import { AccountLevelObject } from '@org/client-ts/models/index';

import { getUserLevel } from './_tenants-new-schema';
import {
	USER_ROLE_OPTIONS,
	type NewTenantAccountLevel,
	type TenantCreateFormValues,
} from './_tenants-new-types';
import { slugifyTenantCode } from './tenants-new-helpers';

/**
 * The prototype's row control (`fields.tsx` rows over Shopkart's `input.tsx`):
 * 36px high, 12px radius, the input-border hairline, the muted fill and the
 * 1px ring that stands for its border. Kept as one constant so every row of
 * the create form shares the measured values.
 */
export const ROW_CONTROL =
	'h-9 rounded-[var(--publy-radius-medium-control)] border-(--publy-input-border) bg-muted px-3 shadow-[var(--publy-shadow-ring)] md:text-sm';

export const ROW_TEXTAREA =
	'min-h-16 resize-none rounded-[var(--publy-radius-medium-control)] border-(--publy-input-border) bg-muted px-3 py-3 shadow-[var(--publy-shadow-ring)] md:text-sm';

export const ROW_SELECT =
	'w-full rounded-[var(--publy-radius-medium-control)] border-(--publy-input-border) bg-muted px-3 text-sm shadow-[var(--publy-shadow-ring)]';

const FieldNote = ({ error, help }: { error?: string; help?: ReactNode }) => {
	if (error) {
		return <p className="text-xs text-destructive">{error}</p>;
	}
	return help ? <p className="text-xs text-muted-foreground">{help}</p> : null;
};

type StringField =
	| 'name'
	| 'code'
	| 'customSeats'
	| 'legalName'
	| 'description'
	| 'websiteUrl'
	| 'billingEmail'
	| 'supportEmail'
	| 'notes';

/** A `FieldRow` around one RHF text input. */
export const TextRow = ({
	name,
	label,
	placeholder,
	help,
	badge,
	type = 'text',
	inputMode,
	mono = false,
	isDisabled,
}: {
	name: StringField;
	label: string;
	placeholder?: string;
	help?: ReactNode;
	badge?: ReactNode;
	type?: 'text' | 'email';
	inputMode?: 'numeric';
	mono?: boolean;
	isDisabled?: boolean;
}) => {
	const id = useId();
	const { control } = useFormContext<TenantCreateFormValues>();

	return (
		<FieldRow label={label} badge={badge} htmlFor={id}>
			<Controller
				name={name}
				control={control}
				render={({ field, fieldState: { error } }) => (
					<>
						<Input
							id={id}
							type={type}
							inputMode={inputMode}
							value={typeof field.value === 'string' ? field.value : ''}
							placeholder={placeholder}
							disabled={isDisabled}
							onBlur={field.onBlur}
							onChange={(event) => {
								field.onChange(event.target.value);
							}}
							aria-invalid={Boolean(error) || undefined}
							className={cn(ROW_CONTROL, mono && 'font-mono')}
						/>
						<FieldNote error={error?.message} help={help} />
					</>
				)}
			/>
		</FieldRow>
	);
};

/** A `FieldRow` around one RHF textarea (the prototype's two-row textareas). */
export const TextareaRow = ({
	name,
	label,
	placeholder,
	help,
	badge,
	isDisabled,
}: {
	name: StringField;
	label: string;
	placeholder?: string;
	help?: ReactNode;
	badge?: ReactNode;
	isDisabled?: boolean;
}) => {
	const id = useId();
	const { control } = useFormContext<TenantCreateFormValues>();

	return (
		<FieldRow label={label} badge={badge} htmlFor={id}>
			<Controller
				name={name}
				control={control}
				render={({ field, fieldState: { error } }) => (
					<>
						<Textarea
							id={id}
							rows={2}
							value={typeof field.value === 'string' ? field.value : ''}
							placeholder={placeholder}
							disabled={isDisabled}
							onBlur={field.onBlur}
							onChange={(event) => {
								field.onChange(event.target.value);
							}}
							aria-invalid={Boolean(error) || undefined}
							className={ROW_TEXTAREA}
						/>
						<FieldNote error={error?.message} help={help} />
					</>
				)}
			/>
		</FieldRow>
	);
};

/** A `FieldRow` around the prototype's `CodeSelect` (the timezone). */
export const CodeSelectRow = ({
	name,
	label,
	options,
	isDisabled,
}: {
	name: 'timezone';
	label: string;
	options: readonly { value: string; label: string }[];
	isDisabled?: boolean;
}) => {
	const id = useId();
	const { control } = useFormContext<TenantCreateFormValues>();
	const values = options.map((option) => option.value);
	const labelOf = (code: string) =>
		options.find((option) => option.value === code)?.label ?? code;

	return (
		<FieldRow label={label} htmlFor={id}>
			<Controller
				name={name}
				control={control}
				render={({ field, fieldState: { error } }) => (
					<>
						<CodeSelect
							id={id}
							value={typeof field.value === 'string' ? field.value : ''}
							options={values}
							label={labelOf}
							onChange={(next) => {
								field.onChange(next);
							}}
							disabled={isDisabled}
							className={ROW_SELECT}
						/>
						<FieldNote error={error?.message} />
					</>
				)}
			/>
		</FieldRow>
	);
};

/**
 * The `Identifiant` row: a mono slug input whose help line previews the
 * address (`publyapp.com/<code>`, else « généré depuis le nom »). Typing
 * slugifies the value and marks `codeEdited`, so a later name edit no longer
 * overwrites it.
 */
export const SlugRow = ({
	label,
	placeholder,
	generatedLabel,
	isDisabled,
}: {
	label: string;
	placeholder: string;
	generatedLabel: string;
	isDisabled?: boolean;
}) => {
	const id = useId();
	const { control, getValues, setValue } =
		useFormContext<TenantCreateFormValues>();
	const code = useWatch({ control, name: 'code' }) ?? '';

	return (
		<FieldRow label={label} htmlFor={id}>
			<Controller
				name="code"
				control={control}
				render={({ field, fieldState: { error } }) => (
					<>
						<Input
							id={id}
							value={field.value}
							placeholder={placeholder}
							disabled={isDisabled}
							onBlur={field.onBlur}
							onChange={(event) => {
								field.onChange(slugifyTenantCode(event.target.value));
								if (!getValues('codeEdited')) {
									setValue('codeEdited', true);
								}
							}}
							aria-invalid={Boolean(error) || undefined}
							className={cn(ROW_CONTROL, 'font-mono')}
						/>
						{error ? (
							<p className="text-xs text-destructive">{error.message}</p>
						) : (
							<p className="text-xs text-muted-foreground">
								publyapp.com/
								<span className="font-medium text-foreground">
									{code.length > 0 ? code : generatedLabel}
								</span>
							</p>
						)}
					</>
				)}
			/>
		</FieldRow>
	);
};

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
				'w-[96px] shrink-0 justify-center gap-1 rounded-[var(--publy-radius-small-control)] border px-2 text-[11px] font-medium shadow-none',
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
	children,
	testId,
}: {
	checked: boolean;
	children: ReactNode;
	testId: string;
}) => (
	<li
		className={cn(
			'flex items-center gap-2',
			checked ? 'text-foreground' : 'text-muted-foreground',
		)}
		data-testid={testId}
		data-checked={checked}
	>
		{checked ? (
			<IconCircleCheckFilled
				aria-hidden="true"
				className="size-4 shrink-0 text-(--publy-success)"
			/>
		) : (
			<IconCircle aria-hidden="true" className="size-4 shrink-0" />
		)}
		<span>{children}</span>
	</li>
);
