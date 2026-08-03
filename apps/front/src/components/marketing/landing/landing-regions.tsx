import type { ReactNode } from 'react';

/**
 * THE THREE REGIONS, AND THE TWO HORIZONS BETWEEN THEM.
 *
 * The page is one day. It opens in the DAWN, crosses a horizon into the DAY,
 * and crosses a second horizon into the NIGHT, which it never leaves.
 *
 * Round 1 mounted the atmosphere once, at document scale, behind everything —
 * one absolutely positioned element carrying a bloom at the top and a quieter
 * one at the foot. That made the sky continuous, and continuous is exactly
 * what made it wallpaper: a gradient that is behind all ten sections is behind
 * none of them, and no reader can tell you where it starts or stops.
 *
 * So the atmosphere is now BOUNDED, and the boundary is the design. Each
 * region is a real element whose height is its own content's height, painting
 * its own field, and the line where one ends and the next begins is drawn:
 * a full-bleed hairline, edge to edge, the only lines on the page that leave
 * the reading column. Two of them, and they are what the page is built on.
 *
 * - `LandingDawn` — full-bleed, warming downward, brightest in the last
 *   200px before the horizon, the way a real dawn concentrates at the ground.
 *   It holds the hero and nothing else.
 * - `LandingDay` — no field at all. Paper, ruled. This is where the whole
 *   argument is made, and it is deliberately the flattest, densest, quietest
 *   part of the page: after a full screen of sky, plainness reads as candour.
 * - `LandingNight` — full-bleed, deepening downward. It opens at the second
 *   horizon and runs off the bottom of the document, swallowing the closing
 *   argument and the footer into one dark object, so the page ends rather
 *   than fades. `foot` renders the continuation used by the footer: the same
 *   ramp picked up exactly where the closing band handed it over, which is
 *   why the two elements read as one field with no seam.
 *
 * Every region is a plain block in normal flow. Nothing here is absolutely
 * positioned and nothing carries a z-index, so the regions paint in document
 * order and each one's field stops precisely where its content does.
 */
export const LandingDawn = ({ children }: { children: ReactNode }) => (
	<div className="publy-landing-dawn">{children}</div>
);

export const LandingDay = ({ children }: { children: ReactNode }) => (
	<div className="publy-landing-day">{children}</div>
);

export const LandingNight = ({
	foot = false,
	children,
}: {
	/** The footer's continuation of the same ramp, without the horizon rule. */
	foot?: boolean;
	children: ReactNode;
}) => (
	<div className={foot ? 'publy-landing-night-foot' : 'publy-landing-night'}>
		{children}
	</div>
);
