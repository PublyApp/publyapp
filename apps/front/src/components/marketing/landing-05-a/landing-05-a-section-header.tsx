import { useTranslation } from 'react-i18next';

/**
 * The section opener, as one object: chip → heading → dek.
 *
 * The transposed page inlined this triple eight times and, in five of those,
 * dropped the dek entirely — so the page's most repeated structure was also
 * its least consistent one, and five sections went from a 13px chip straight
 * to a 48px heading to a grid with no mid-tier for the eye to land on. One
 * component now owns the triple, which is what lets the spacing be stated
 * once and be optically rather than mathematically correct everywhere
 * (`landing-05-a.css`, "THE SPACING SCALE"): 20px eyebrow→heading so the gap
 * reads as 24, 12px heading→dek because they are one utterance, and 48px to
 * the body so the triple reads as an object rather than as the grid's first
 * row.
 *
 * The heading is capped at 24 characters. A 48px line running the full
 * 1104px column is 34 characters wide and reads as a caption stretched, not
 * as a display statement; at 24ch every section heading on the page becomes
 * a one- or two-line block with a deliberate rag, in both locales.
 *
 * `dekTestId` exists for one caller: the planned-trial section's plan note is
 * both its dek and the claim the page is gated on, and a unit test asserts
 * that note sits inside that section.
 */
export const Landing05ASectionHeader = ({
	headingId,
	eyebrowKey,
	titleKey,
	dekKey,
	dekTestId,
}: {
	headingId: string;
	eyebrowKey: string;
	titleKey: string;
	dekKey?: string;
	dekTestId?: string;
}) => {
	const { t } = useTranslation('landing-05-a');

	return (
		<div>
			{/* THE EYEBROW IS TYPE, NOT A CHIP. Round one gave it a soft-yellow
			    pill with a hairline ring, and the reason it gave was contrast:
			    the muted step failed against the bloom the eyebrow used to sit
			    on. There is no bloom under it any more — the day is paper — so
			    what was left was a yellow pill at eight section openings, which
			    is decoration by repetition rather than a mark that means
			    anything. `--publy-marketing-eyebrow-accent` measures 5.05:1 on
			    white, and the eyebrow now reads as what it is: a label, in the
			    brand's own colour, at the top of a section. Chips still exist on
			    this page — the hero badge, the closing eyebrow, the featured
			    tier's badge — and each of the three appears exactly once. */}
			<p className="publy-marketing-eyebrow text-(--publy-marketing-eyebrow-accent)">
				{t(eyebrowKey)}
			</p>
			<h2
				id={headingId}
				className="publy-type-sky-display-2 publy-l05a-header-heading publy-l05a-optical-flush max-w-[24ch] text-balance text-(--publy-foreground)"
			>
				{t(titleKey)}
			</h2>
			{dekKey === undefined ? null : (
				<p
					data-testid={dekTestId}
					className="publy-type-sky-lead publy-l05a-header-dek max-w-[52ch] text-pretty text-(--publy-foreground-secondary)"
				>
					{t(dekKey)}
				</p>
			)}
		</div>
	);
};
