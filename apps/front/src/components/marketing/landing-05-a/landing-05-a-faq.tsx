import { useTranslation } from 'react-i18next';

const FAQ_ITEMS = ['0', '1', '2', '3'] as const;

/**
 * §8 — FAQ, rebuilt as a ruled list. Four short answers read better fully
 * open, in one column, than behind any disclosure widget: nothing to click,
 * nothing to reflow, and the page reads as though it isn't hiding anything
 * (`padyna-01`/`attio-14`'s own device — a hairline rule, not a border —
 * continued from the section rhythm into the FAQ itself). A bordered,
 * chevron-toggled card is the one shape THE SKY's two-object rule forbids:
 * neither a window nor a panel, so it was the only "third kind of object" on
 * the page. The prior `columns-1 sm:columns-2` layout also rebalanced its
 * column break whenever an answer's height changed — confirmed in a browser,
 * where opening one item moved another item's position without touching it —
 * which a single reading order removes structurally rather than patches.
 */
export const Landing05AFaq = () => {
	const { t } = useTranslation('landing-05-a');

	return (
		<div className="publy-l05a-section-body flex max-w-[66ch] flex-col">
			{FAQ_ITEMS.map((item) => (
				<div
					key={item}
					className="publy-l05a-faq-item flex flex-col gap-3 py-8"
				>
					<h3 className="publy-type-sky-display-4 text-(--publy-foreground)">
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
