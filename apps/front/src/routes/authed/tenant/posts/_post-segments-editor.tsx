import {
	IconArrowDown,
	IconArrowUp,
	IconPlus,
	IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import type { DestinationOverrides } from '~/lib/publishing/destination-overrides';
import type { LimitedDestination } from '~/lib/text-counter/text-counter';
import { useTextCounter } from '~/lib/text-counter/use-text-counter';

import { PublishLimitCounter } from './_publish-limit-counter';
import { inheritingDestinations } from './_publish-validation';
import type { SegmentDraft } from './_segment-draft';
import { newSegmentDraft } from './_segment-draft';
import type { SelectedDestination } from './_use-publish-selection';

const NO_OVERRIDES: DestinationOverrides = {};

/** A thread is at most 25 segments: the first post body plus 24 follow-ups. */
const MAX_THREAD_SEGMENTS = 25;

const moveItem = (
	list: SegmentDraft[],
	from: number,
	to: number,
): SegmentDraft[] => {
	const next = [...list];
	const [moved] = next.splice(from, 1);
	if (moved === undefined) {
		return list;
	}
	next.splice(to, 0, moved);
	return next;
};

type SegmentBlockProps = {
	/** 0-based among the follow-ups; the segment number is index + 2. */
	index: number;
	total: number;
	text: string;
	destinations: readonly LimitedDestination[];
	/** 'published' shows the "Published" badge; 'busy' is read-only for now
	 * (a save is in flight) without being published. */
	lock: 'none' | 'published' | 'busy';
	/** Why this follow-up's text is refused (a field error), if it is. */
	errorMessage?: string;
	canMoveEarlier: boolean;
	canMoveLater: boolean;
	onTextChange: (value: string) => void;
	onMoveEarlier: () => void;
	onMoveLater: () => void;
	onRemove: () => void;
	/** Under the text: this segment's images (the caller owns where they live). */
	children?: ReactNode;
};

const SegmentBlock = ({
	index,
	total,
	text,
	destinations,
	lock,
	errorMessage,
	canMoveEarlier,
	canMoveLater,
	onTextChange,
	onMoveEarlier,
	onMoveLater,
	onRemove,
	children,
}: SegmentBlockProps) => {
	const { t } = useTranslation(['posts']);
	const tightest = useTextCounter(text, destinations);
	const number = index + 2;
	const fieldId = `post-segment-${index}`;
	const isFrozen = lock !== 'none';

	return (
		<li
			className="space-y-2 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-(--publy-border-strong) bg-(--publy-surface-muted) p-3"
			data-testid="tenant-posts-segment"
			data-locked={lock === 'published' ? 'true' : undefined}
		>
			<div className="flex items-center gap-2">
				<Label htmlFor={fieldId} data-testid="tenant-posts-segment-number">
					{t('posts:segment-number', { index: number, total })}
				</Label>
				{lock === 'published' ? (
					<span
						className="publy-type-helper text-muted-foreground"
						data-testid="tenant-posts-segment-published"
					>
						{t('posts:segment-published')}
					</span>
				) : null}
				<div className="ml-auto flex shrink-0 gap-1">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={isFrozen || !canMoveEarlier}
						aria-label={t('posts:segment-move-earlier', { index: number })}
						data-testid="tenant-posts-segment-move-earlier"
						onClick={onMoveEarlier}
					>
						<IconArrowUp aria-hidden="true" className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={isFrozen || !canMoveLater}
						aria-label={t('posts:segment-move-later', { index: number })}
						data-testid="tenant-posts-segment-move-later"
						onClick={onMoveLater}
					>
						<IconArrowDown aria-hidden="true" className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={isFrozen}
						aria-label={t('posts:segment-remove', { index: number })}
						data-testid="tenant-posts-segment-remove"
						onClick={onRemove}
					>
						<IconX aria-hidden="true" className="size-4" />
					</Button>
				</div>
			</div>
			<Textarea
				id={fieldId}
				rows={4}
				value={text}
				readOnly={isFrozen}
				aria-invalid={errorMessage ? true : undefined}
				aria-describedby={errorMessage ? `${fieldId}-error` : undefined}
				placeholder={t('posts:segment-placeholder')}
				data-testid="tenant-posts-segment-body"
				onChange={(event) => onTextChange(event.target.value)}
			/>
			{errorMessage ? (
				<p
					className="text-sm text-destructive"
					id={`${fieldId}-error`}
					role="alert"
					data-testid="tenant-posts-segment-error"
				>
					{errorMessage}
				</p>
			) : null}
			<PublishLimitCounter tightest={tightest} />
			{children}
		</li>
	);
};

export type PostSegmentsEditorProps = {
	/** The follow-up segments (segments 2..N) in order. */
	segments: SegmentDraft[];
	onChange: (next: SegmentDraft[]) => void;
	/** Leading segments (counting the first) already published: read-only. */
	publishedSegmentCount: number;
	/** The SELECTED publish destinations: every segment counter measures
	 * against the limits of those that INHERIT the segment, like the Publish
	 * button does. */
	destinations: readonly SelectedDestination[];
	/** What each destination customizes: a destination with its own text for a
	 * segment is not counted against the shared one. */
	overrides?: DestinationOverrides;
	/** The images of one follow-up, rendered under its text. `number` is the
	 * segment number (2..N). Omit for a text-only thread. */
	renderImages?: (segment: SegmentDraft, number: number) => ReactNode;
	/** Everything is read-only for now (a save is in flight: what is typed
	 * meanwhile would be overwritten when it ends). */
	isDisabled?: boolean;
	/** Field errors by follow-up position (0-based), from the form. */
	errors?: readonly (string | undefined)[];
};

type SegmentListProps = PostSegmentsEditorProps & {
	total: number;
	onRequestRemove: (index: number) => void;
};

/** The follow-up blocks. */
const SegmentList = ({
	segments,
	onChange,
	publishedSegmentCount,
	destinations,
	overrides = NO_OVERRIDES,
	renderImages,
	isDisabled = false,
	errors,
	total,
	onRequestRemove,
}: SegmentListProps) => {
	const isLockedAt = (index: number) => index + 2 <= publishedSegmentCount;
	const lockAt = (index: number) => {
		if (isLockedAt(index)) {
			return 'published';
		}
		return isDisabled ? 'busy' : 'none';
	};

	return (
		<ol className="space-y-3">
			{segments.map((segment, index) => (
				<SegmentBlock
					key={segment.id}
					index={index}
					total={total}
					text={segment.text}
					destinations={inheritingDestinations(
						destinations,
						overrides,
						segment.id,
					)}
					lock={lockAt(index)}
					errorMessage={errors?.[index]}
					canMoveEarlier={index > 0 && !isLockedAt(index - 1)}
					canMoveLater={index < segments.length - 1}
					onTextChange={(value) =>
						onChange(
							segments.map((current, position) =>
								position === index ? { ...current, text: value } : current,
							),
						)
					}
					onMoveEarlier={() => onChange(moveItem(segments, index, index - 1))}
					onMoveLater={() => onChange(moveItem(segments, index, index + 1))}
					onRemove={() => onRequestRemove(index)}
				>
					{renderImages?.(segment, index + 2)}
				</SegmentBlock>
			))}
		</ol>
	);
};

/** Thread follow-ups under the post body: add, remove (confirming a
 * non-empty one), reorder with the arrows, one live counter per segment.
 * Already-published segments stay visible but read-only. */
export const PostSegmentsEditor = ({
	segments,
	onChange,
	publishedSegmentCount,
	destinations,
	overrides,
	renderImages,
	isDisabled = false,
	errors,
}: PostSegmentsEditorProps) => {
	const { t } = useTranslation(['posts', 'common']);
	const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
		null,
	);
	const total = segments.length + 1;
	const isFull = total >= MAX_THREAD_SEGMENTS;

	const requestRemove = (index: number) => {
		const text = segments[index]?.text ?? '';
		if (text.trim() === '') {
			onChange(segments.filter((_, position) => position !== index));
			return;
		}
		setPendingRemoveIndex(index);
	};

	const confirmRemove = () => {
		if (pendingRemoveIndex !== null) {
			onChange(
				segments.filter((_, position) => position !== pendingRemoveIndex),
			);
		}
		setPendingRemoveIndex(null);
	};

	return (
		<section className="space-y-3" data-testid="tenant-posts-segments">
			{segments.length > 0 ? (
				<p
					className="text-[13px] font-medium text-foreground"
					data-testid="tenant-posts-segment-first-number"
				>
					{t('posts:segment-first', { total })}
				</p>
			) : null}
			{segments.length > 0 ? (
				<SegmentList
					segments={segments}
					onChange={onChange}
					publishedSegmentCount={publishedSegmentCount}
					destinations={destinations}
					overrides={overrides}
					renderImages={renderImages}
					isDisabled={isDisabled}
					errors={errors}
					total={total}
					onRequestRemove={requestRemove}
				/>
			) : null}
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={isFull || isDisabled}
				data-testid="tenant-posts-segment-add"
				onClick={() => onChange([...segments, newSegmentDraft()])}
			>
				<IconPlus aria-hidden="true" className="size-4" />
				{t('posts:segment-add')}
			</Button>
			{isFull ? (
				<p className="publy-type-helper text-muted-foreground">
					{t('posts:segment-limit-reached', { max: MAX_THREAD_SEGMENTS })}
				</p>
			) : null}
			<ConfirmDialog
				isOpen={pendingRemoveIndex !== null}
				title={t('posts:segment-remove-title')}
				description={t('posts:segment-remove-description')}
				confirmLabel={t('posts:segment-remove-confirm')}
				onConfirm={confirmRemove}
				onOpenChange={(open) => {
					if (!open) {
						setPendingRemoveIndex(null);
					}
				}}
			/>
		</section>
	);
};
