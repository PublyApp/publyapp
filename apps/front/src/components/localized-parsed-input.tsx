import { IconAlertCircle } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { Input } from '~/components/ui/input';

export type LocalizedParsedInputProps = {
	/** The canonical value (ISO date, `HH:mm`): the source of truth. */
	value: string | undefined;
	ariaLabel: string;
	/** Visible, associated message for an unparseable or out-of-range entry. */
	errorMessage: string;
	testId: string;
	placeholder: string;
	className?: string;
	/** Canonical value → what the field shows. */
	format: (value: string | undefined) => string;
	/** What was typed → canonical value; `undefined` invalid, `''` empty. */
	parse: (raw: string) => string | undefined | '';
	/** A parsed value that is out of range (min/max). */
	isOutOfRange?: (parsed: string) => boolean;
	onChange: (value: string | undefined) => void;
	/** A typed entry was refused (unparseable or out of range): the last value
	 * passed to `onChange` is stale, so a caller that submits must not use it. */
	onInvalid?: () => void;
	/** Soft keyboards: `numeric` only where no letter is ever needed. */
	inputMode?: 'numeric' | 'text';
	/** Whether the field holds typed text not yet committed (blur or Enter):
	 * a caller can then keep its submit enabled and let the click's own blur
	 * commit and validate it. */
	onDraftChange?: (hasText: boolean) => void;
} & (
	| { errorId?: undefined; hideError?: false }
	/** The caller renders the message itself (element id = `errorId`), e.g. one
	 * message under a row of fields. Every field then points at that id. */
	| { errorId: string; hideError: true }
);

/** What the user typed, pinned to the external value it was typed against. */
type Draft = { text: string; value: string | undefined };
type EntryError = { message: string; value: string | undefined };

export const LocalizedParsedInput = ({
	value,
	ariaLabel,
	errorMessage,
	testId,
	placeholder,
	className,
	format,
	parse,
	isOutOfRange,
	onChange,
	onInvalid,
	errorId: externalErrorId,
	hideError = false,
	inputMode = 'numeric',
	onDraftChange,
}: LocalizedParsedInputProps) => {
	const ownErrorId = useId();
	const errorId = externalErrorId ?? ownErrorId;
	const [draft, setDraft] = useState<Draft | null>(null);
	const [error, setError] = useState<EntryError | null>(null);

	/*
	 * The external value is the source of truth until the user edits. Both the
	 * draft and the error are pinned to the value they were produced for, so an
	 * external change (URL back/forward, another filter reset) invalidates them
	 * without a prop-syncing effect and without remounting the input.
	 */
	const activeDraft = draft !== null && draft.value === value ? draft : null;
	const shown = activeDraft?.text ?? format(value);
	const visibleError =
		error !== null && error.value === value ? error.message : '';

	const commit = (raw: string): void => {
		const parsed = parse(raw);

		onDraftChange?.(false);

		if (parsed === undefined) {
			setError({ message: raw.trim().length > 0 ? errorMessage : '', value });
			if (raw.trim().length > 0) {
				onInvalid?.();
			}
			return;
		}

		if (parsed !== '' && isOutOfRange?.(parsed)) {
			setError({ message: errorMessage, value });
			onInvalid?.();
			return;
		}

		setError(null);
		setDraft(null);
		onChange(parsed === '' ? undefined : parsed);
	};

	return (
		<div className="flex flex-col gap-1">
			<Input
				type="text"
				inputMode={inputMode}
				autoComplete="off"
				spellCheck={false}
				aria-label={ariaLabel}
				aria-invalid={visibleError ? true : undefined}
				aria-errormessage={visibleError ? errorId : undefined}
				aria-describedby={visibleError ? errorId : undefined}
				placeholder={placeholder}
				data-testid={testId}
				value={shown}
				className={className}
				onBlur={(event) => commit(event.currentTarget.value)}
				onChange={(event) => {
					const next = event.currentTarget.value;
					setDraft({ text: next, value });
					setError(null);
					onDraftChange?.(next.trim().length > 0);
					if (next.trim().length === 0) {
						onChange(undefined);
					}
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						commit(event.currentTarget.value);
					}
				}}
			/>
			{visibleError && !hideError ? (
				<p id={errorId} className="publy-field-error" role="alert">
					<IconAlertCircle aria-hidden="true" />
					{visibleError}
				</p>
			) : null}
		</div>
	);
};

/** `Omit` that keeps the `errorId` / `hideError` union intact. */
export type OmitFromParsedInputProps<
	K extends keyof LocalizedParsedInputProps,
> = LocalizedParsedInputProps extends infer P
	? P extends unknown
		? Omit<P, K>
		: never
	: never;
