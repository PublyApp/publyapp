import {
	IconArrowDown,
	IconArrowUp,
	IconPlus,
	IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import type { LimitedDestination } from '~/lib/text-counter/text-counter';
import { useTextCounter } from '~/lib/text-counter/use-text-counter';

import { PublishLimitCounter } from './_publish-limit-counter';
import { useLimitedDestinations } from './_use-limited-destinations';

/** A thread is at most 25 segments: the first post body plus 24 follow-ups. */
const MAX_THREAD_SEGMENTS = 25;

const moveItem = (list: string[], from: number, to: number): string[] => {
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
	isLocked: boolean;
	canMoveEarlier: boolean;
	canMoveLater: boolean;
	onTextChange: (value: string) => void;
	onMoveEarlier: () => void;
	onMoveLater: () => void;
	onRemove: () => void;
};

const SegmentBlock = ({
	index,
	total,
	text,
	destinations,
	isLocked,
	canMoveEarlier,
	canMoveLater,
	onTextChange,
	onMoveEarlier,
	onMoveLater,
	onRemove,
}: SegmentBlockProps) => {
	const { t } = useTranslation(['posts']);
	const tightest = useTextCounter(text, destinations);
	const number = index + 2;
	const fieldId = `post-segment-${index}`;

	return (
		<li
			className="space-y-2 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-(--publy-border-strong) bg-(--publy-surface-muted) p-3"
			data-testid="tenant-posts-segment"
			data-locked={isLocked ? 'true' : undefined}
		>
			<div className="flex items-center gap-2">
				<Label htmlFor={fieldId} data-testid="tenant-posts-segment-number">
					{t('posts:segment-number', { index: number, total })}
				</Label>
				{isLocked ? (
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
						disabled={isLocked || !canMoveEarlier}
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
						disabled={isLocked || !canMoveLater}
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
						disabled={isLocked}
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
				readOnly={isLocked}
				placeholder={t('posts:segment-placeholder')}
				data-testid="tenant-posts-segment-body"
				onChange={(event) => onTextChange(event.target.value)}
			/>
			<PublishLimitCounter tightest={tightest} />
		</li>
	);
};

export type PostSegmentsEditorProps = {
	/** The follow-up segments (segments 2..N) in order. */
	segments: string[];
	onChange: (next: string[]) => void;
	/** Leading segments (counting the first) already published: read-only. */
	publishedSegmentCount: number;
	/** The post's project: decides which destinations (and limits) apply. */
	projectId: string | null;
};

type SegmentListProps = Omit<PostSegmentsEditorProps, 'projectId'> & {
	destinations: readonly LimitedDestination[];
	total: number;
	onRequestRemove: (index: number) => void;
};

/** The follow-up blocks. A separate component so the destination limits are
 * only looked up once the post is actually a thread. */
const SegmentList = ({
	segments,
	onChange,
	publishedSegmentCount,
	destinations,
	total,
	onRequestRemove,
}: SegmentListProps) => {
	const isLockedAt = (index: number) => index + 2 <= publishedSegmentCount;

	return (
		<ol className="space-y-3">
			{segments.map((text, index) => (
				<SegmentBlock
					// Segments are plain strings reordered in place: the position is
					// the only identity they have.
					key={index}
					index={index}
					total={total}
					text={text}
					destinations={destinations}
					isLocked={isLockedAt(index)}
					canMoveEarlier={index > 0 && !isLockedAt(index - 1)}
					canMoveLater={index < segments.length - 1}
					onTextChange={(value) =>
						onChange(
							segments.map((current, position) =>
								position === index ? value : current,
							),
						)
					}
					onMoveEarlier={() => onChange(moveItem(segments, index, index - 1))}
					onMoveLater={() => onChange(moveItem(segments, index, index + 1))}
					onRemove={() => onRequestRemove(index)}
				/>
			))}
		</ol>
	);
};

const ThreadSegments = (
	props: Omit<SegmentListProps, 'destinations'> & { projectId: string | null },
) => {
	const { projectId, ...rest } = props;
	const destinations = useLimitedDestinations(projectId);

	return <SegmentList {...rest} destinations={destinations} />;
};

/** Thread follow-ups under the post body: add, remove (confirming a
 * non-empty one), reorder with the arrows, one live counter per segment.
 * Already-published segments stay visible but read-only. */
export const PostSegmentsEditor = ({
	segments,
	onChange,
	publishedSegmentCount,
	projectId,
}: PostSegmentsEditorProps) => {
	const { t } = useTranslation(['posts', 'common']);
	const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
		null,
	);
	const total = segments.length + 1;
	const isFull = total >= MAX_THREAD_SEGMENTS;

	const requestRemove = (index: number) => {
		const text = segments[index] ?? '';
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
				<ThreadSegments
					segments={segments}
					onChange={onChange}
					publishedSegmentCount={publishedSegmentCount}
					projectId={projectId}
					total={total}
					onRequestRemove={requestRemove}
				/>
			) : null}
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={isFull}
				data-testid="tenant-posts-segment-add"
				onClick={() => onChange([...segments, ''])}
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
