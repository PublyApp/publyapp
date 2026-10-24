import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

import type { ComposerImage } from './_destination-media-field';

type RowProps = {
	/** Unique per destination tab: the alt text input's id derives from it. */
	idPrefix: string;
	image: ComposerImage;
	/** 1-based place of the image in the shared post. */
	number: number;
	isIncluded: boolean;
	altText: string;
	canMoveEarlier: boolean;
	canMoveLater: boolean;
	onIncludedChange: (included: boolean) => void;
	onAltChange: (value: string) => void;
	onMoveEarlier: () => void;
	onMoveLater: () => void;
};

export const MediaRow = ({
	idPrefix,
	image,
	number,
	isIncluded,
	altText,
	canMoveEarlier,
	canMoveLater,
	onIncludedChange,
	onAltChange,
	onMoveEarlier,
	onMoveLater,
}: RowProps) => {
	const { t } = useTranslation(['posts']);
	const altId = `${idPrefix}-alt-${image.key}`;

	return (
		<li
			className="space-y-2 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-(--publy-border-strong) bg-(--publy-surface-muted) p-3"
			data-testid="tenant-posts-destination-image"
			data-included={isIncluded ? 'true' : 'false'}
		>
			<div className="flex items-center gap-3">
				<Checkbox
					checked={isIncluded}
					aria-label={t('posts:destination-media-include', { index: number })}
					data-testid="tenant-posts-destination-image-include"
					onCheckedChange={(checked) => onIncludedChange(Boolean(checked))}
				/>
				{image.url !== null ? (
					<img
						src={image.url}
						alt=""
						className="max-h-12 max-w-20 rounded-[10px] object-contain"
					/>
				) : null}
				<span className="text-[13px] font-medium">
					{t('posts:image-card-label', { index: number })}
				</span>
				<div className="ml-auto flex shrink-0 gap-1">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={!canMoveEarlier}
						aria-label={t('posts:image-move-earlier', { index: number })}
						data-testid="tenant-posts-destination-image-earlier"
						onClick={onMoveEarlier}
					>
						<IconArrowUp aria-hidden="true" className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={!canMoveLater}
						aria-label={t('posts:image-move-later', { index: number })}
						data-testid="tenant-posts-destination-image-later"
						onClick={onMoveLater}
					>
						<IconArrowDown aria-hidden="true" className="size-4" />
					</Button>
				</div>
			</div>
			<div className="space-y-1">
				<Label htmlFor={altId}>
					{t('posts:image-alt-label-numbered', { index: number })}
				</Label>
				<Input
					id={altId}
					value={altText}
					placeholder={t('posts:image-alt-placeholder')}
					disabled={!isIncluded}
					data-testid="tenant-posts-destination-image-alt"
					onChange={(event) => onAltChange(event.target.value)}
					onKeyDown={(event) => {
						// Enter in a field must not submit the surrounding post form.
						if (event.key === 'Enter') {
							event.preventDefault();
						}
					}}
				/>
			</div>
		</li>
	);
};
