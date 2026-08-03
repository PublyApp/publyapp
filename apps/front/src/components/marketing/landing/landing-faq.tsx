import { useTranslation } from 'react-i18next';

const FAQ_ITEMS = ['0', '1', '2', '3'] as const;

/**
 * §8 — FAQ, a ruled list. Four short answers read better fully open, in one
 * column, than behind any disclosure widget: nothing to click, nothing to
 * reflow, and the page reads as though it isn't hiding anything
 * (`padyna-01`/`attio-14`'s own device — a hairline rule, not a border —
 * continued from the section rhythm into the FAQ itself). A bordered,
 * chevron-toggled card is the shape the page's three-surface rule forbids
 * here: an FAQ is a thing to READ, and the page raises a surface only where it
 * asks the reader to DECIDE (`landing.css`, "THE THREE SURFACES") — which
 * happens once, at pricing. The prior `columns-1 sm:columns-2` layout also rebalanced its
 * column break whenever an answer's height changed — confirmed in a browser,
 * where opening one item moved another item's position without touching it —
 * which a single reading order removes structurally rather than patches.
 *
 * ONE COLUMN, at every breakpoint. The heading sits above the questions, full
 * width, exactly like every other section's. There is no side rail, no split
 * and no offset: an FAQ is a single reading order and any second column —
 * even one that only holds the heading — makes the reader choose where to
 * start. The empty right half of a 66ch list is not dead space to be filled,
 * it is the margin a long-measure answer needs.
 *
 * `first:pt-0` keeps the first question's cap on the section-body gap rather
 * than 32px below it, so the list starts where the header's dek says it does.
 */
export const LandingFaq = () => {
	const { t } = useTranslation('landing');

	return (
		<div className="publy-landing-section-body flex max-w-[66ch] flex-col">
			{FAQ_ITEMS.map((item) => (
				<div
					key={item}
					className="publy-landing-faq-item flex flex-col gap-3 py-8 first:pt-0"
				>
					<h3 className="publy-type-sky-display-4 text-balance text-(--publy-foreground)">
						{t(`landing-faq-${item}-question`)}
					</h3>
					<p className="publy-type-sky-prose text-pretty text-(--publy-foreground-secondary)">
						{t(`landing-faq-${item}-answer`)}
					</p>
				</div>
			))}
		</div>
	);
};
