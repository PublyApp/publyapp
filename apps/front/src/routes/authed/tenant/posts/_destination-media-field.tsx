import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import type { MediaOverride } from '~/lib/publishing/destination-overrides';

/** An image of the shared post as the destination tab sees it. */
export type ComposerImage = {
	/** Stable key: the asset id once uploaded, a local id before. */
	key: string;
	/** Server url, when the image is already uploaded. */
	url: string | null;
	/** The shared alt text this destination inherits. */
	altText: string;
};

const moveKey = (keys: string[], from: number, to: number): string[] => {
	const next = [...keys];
	const [moved] = next.splice(from, 1);
	if (moved === undefined) {
		return keys;
	}
	next.splice(to, 0, moved);
	return next;
};

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

const MediaRow = ({
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

type ListProps = {
	idPrefix: string;
	images: readonly ComposerImage[];
	value: MediaOverride;
	maxImages: number | null;
	onChange: (next: MediaOverride) => void;
};

/** The customized state: every shared image, included ones first in this
 * destination's order, then the left-out ones. */
const MediaList = ({
	idPrefix,
	images,
	value,
	maxImages,
	onChange,
}: ListProps) => {
	const { t } = useTranslation(['posts']);
	const byKey = new Map(
		images.map((image, index) => [image.key, { image, index }]),
	);
	// No explicit list: every image of the post, in its order. An explicit one
	// may still name an image that was removed from the post: leave it out.
	const includedKeys =
		value.imageKeys === null
			? images.map((image) => image.key)
			: value.imageKeys.filter((key) => byKey.has(key));
	const includedSet = new Set(includedKeys);
	const leftOutKeys = images.flatMap((image) =>
		includedSet.has(image.key) ? [] : [image.key],
	);

	const setAlt = (key: string, altText: string, shared: string) => {
		const altTexts = Object.fromEntries(
			Object.entries(value.altTexts).filter(([entryKey]) => entryKey !== key),
		);
		onChange({
			...value,
			altTexts: altText === shared ? altTexts : { ...altTexts, [key]: altText },
		});
	};
	const setKeys = (imageKeys: string[]) => onChange({ ...value, imageKeys });

	return (
		<>
			<p className="publy-type-helper text-muted-foreground">
				{maxImages === null
					? t('posts:destination-media-help')
					: t('posts:destination-media-help-max', { max: maxImages })}
			</p>
			<ul className="space-y-2">
				{[...includedKeys, ...leftOutKeys].map((key) => {
					const entry = byKey.get(key);
					if (entry === undefined) {
						return null;
					}
					const includedIndex = includedKeys.indexOf(key);
					const isIncluded = includedIndex >= 0;
					return (
						<MediaRow
							key={key}
							idPrefix={idPrefix}
							image={entry.image}
							number={entry.index + 1}
							isIncluded={isIncluded}
							altText={value.altTexts[key] ?? entry.image.altText}
							canMoveEarlier={isIncluded && includedIndex > 0}
							canMoveLater={
								isIncluded && includedIndex < includedKeys.length - 1
							}
							onIncludedChange={(included) =>
								setKeys(
									included
										? [...includedKeys, key]
										: includedKeys.filter((current) => current !== key),
								)
							}
							onAltChange={(next) => setAlt(key, next, entry.image.altText)}
							onMoveEarlier={() =>
								setKeys(moveKey(includedKeys, includedIndex, includedIndex - 1))
							}
							onMoveLater={() =>
								setKeys(moveKey(includedKeys, includedIndex, includedIndex + 1))
							}
						/>
					);
				})}
			</ul>
			{includedKeys.length === 0 ? (
				<p
					className="publy-type-helper text-[var(--publy-danger)]"
					role="status"
					data-testid="tenant-posts-destination-media-empty"
				>
					{t('posts:destination-media-empty')}
				</p>
			) : null}
		</>
	);
};

/** The images of a destination's tab: an override toggle, then which of the
 * shared post's images this destination publishes, in what order, and with
 * which alt text. Off, the destination inherits every image in the shared
 * order. */
export const DestinationMediaField = ({
	idPrefix,
	images,
	value,
	maxImages,
	onChange,
}: {
	/** Unique per destination tab (switch and alt text ids derive from it). */
	idPrefix: string;
	images: readonly ComposerImage[];
	value: MediaOverride | null;
	/** The destination's own image cap, when the server advertised one. */
	maxImages: number | null;
	onChange: (next: MediaOverride | null) => void;
}) => {
	const { t } = useTranslation(['posts']);
	const switchId = `${idPrefix}-media-override`;

	return (
		<div className="space-y-2" data-testid="tenant-posts-destination-media">
			<div className="flex items-center justify-between gap-3">
				<Label htmlFor={switchId}>{t('posts:images-label')}</Label>
				<div className="flex items-center gap-2">
					<label htmlFor={switchId} className="publy-type-helper">
						{t('posts:destination-override-media')}
					</label>
					<Switch
						id={switchId}
						size="sm"
						checked={value !== null}
						disabled={images.length === 0 && value === null}
						data-testid="tenant-posts-destination-media-toggle"
						onCheckedChange={(checked) =>
							// On inherits every image (null) until the set or order changes.
							onChange(checked ? { imageKeys: null, altTexts: {} } : null)
						}
					/>
				</div>
			</div>
			{images.length === 0 ? (
				<p className="publy-type-helper text-muted-foreground">
					{t('posts:destination-media-none')}
				</p>
			) : null}
			{images.length > 0 && value === null ? (
				<p
					className="publy-type-helper text-muted-foreground"
					data-testid="tenant-posts-destination-media-inherited"
				>
					{t('posts:destination-media-inherited', { count: images.length })}
				</p>
			) : null}
			{value === null ? null : (
				<MediaList
					idPrefix={idPrefix}
					images={images}
					value={value}
					maxImages={maxImages}
					onChange={onChange}
				/>
			)}
		</div>
	);
};
