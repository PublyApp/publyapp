/**
 * `ComputedStyleReader` — the type used by the icon visibility guard to read
 * computed CSS values without coupling to `window.getComputedStyle`. jsdom
 * does not parse the Tailwind stylesheet, so a class-based hide (e.g. the
 * `invisible` utility) does not change the value jsdom computes — the unit
 * tests therefore inject a reader that returns the values a real browser
 * would compute for the class the test just applied. The real-browser spec
 * bundles the guard module verbatim into the page, so its default reader
 * resolves to Chromium's own `getComputedStyle`.
 *
 * Do not extend the "empty string" claim further than it is true (measured,
 * #1899): the engine's UNRESOLVED marker is the empty string, which Chromium
 * returns for a detached node; jsdom 30 returns resolved defaults there
 * instead (`visible` / `inline` / `1`) and never `''` for these three
 * properties. The guard's indeterminate gate treats `''` as "not resolved"
 * regardless of lane.
 */
export type ComputedStyleReader = (element: Element) => {
	visibility: string;
	display: string;
	opacity: string;
};
