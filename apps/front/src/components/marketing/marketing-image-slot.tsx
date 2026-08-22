import type { CSSProperties, ReactElement } from 'react';

/**
 * A reserved, deliberately EMPTY space where a real product image will later be
 * injected.
 *
 * This is the single greppable injection point for marketing imagery — one
 * component, one grep (`MarketingImageSlot`), every future asset site findable.
 * It exists because the owner ruled that an unfilled slot must show *nothing*
 * rather than a substitute: no grey plate, no border, no dashed outline, no
 * icon, no label, no skeleton shimmer, no gradient, no wireframe. An elaborate
 * stand-in reads as compensating, and compensating reads as cheap.
 *
 * The contract every caller must honour:
 *
 * 1. The slot reserves its **exact** final space, so dropping a real image in
 *    later causes zero layout shift. Sizing is a design decision to be stated
 *    in numbers — either `ratio` or an explicit height in `className`.
 * 2. It renders no user-visible text, so it needs no i18n key and adds nothing
 *    to the accessibility tree.
 * 3. The section must read as finished with the slot empty. If a layout only
 *    works once the image arrives, the layout is wrong.
 *
 * `subject` is documentation, not output: it records what asset belongs here so
 * the register can be reconstructed from the code alone. It is never rendered.
 * `alt` is the seat for the real image's alternative text; it is likewise not
 * rendered today and exists so adding the asset is a one-prop change rather
 * than an API change.
 */
export type MarketingImageSlotProps = {
	/** Stable slot id, e.g. `hero-calendar`. Unique within a page. */
	slot: string;
	/** What image belongs here. Documentation only — never rendered. */
	subject: string;
	/** CSS aspect ratio, e.g. `16 / 9`. Omit when height comes from className. */
	ratio?: string;
	/**
	 * Opt-in whisper of mass for a section that genuinely collapses when the
	 * slot is empty. Draws a single very-low-alpha tint from an existing token
	 * and nothing else. Default is fully transparent; every use needs a reason.
	 */
	tint?: boolean;
	/** i18n key for the future image's alt text. Not rendered while empty. */
	alt?: string;
	className?: string;
};

export function MarketingImageSlot({
	slot,
	subject,
	ratio,
	tint = false,
	alt,
	className,
}: MarketingImageSlotProps): ReactElement {
	const style: CSSProperties = {};
	if (ratio !== undefined) {
		style.aspectRatio = ratio;
	}
	if (tint) {
		style.backgroundColor =
			'color-mix(in oklab, var(--publy-foreground) 3%, transparent)';
	}

	return (
		<div
			aria-hidden="true"
			className={className}
			data-marketing-image-slot={slot}
			data-marketing-image-subject={subject}
			data-marketing-image-alt-key={alt}
			style={style}
		/>
	);
}
