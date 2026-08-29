/**
 * `ComputedStyleReader` — the type used by the icon visibility guard to read
 * computed CSS values without coupling to `window.getComputedStyle`. jsdom
 * returns empty strings for every `getComputedStyle` call when the class is
 * a Tailwind utility (jsdom does not parse the stylesheet), so the unit
 * tests inject a reader that returns the values they want the guard to
 * measure against. The real-browser spec feeds the result of Chromium's
 * own `getComputedStyle` instead.
 */
export type ComputedStyleReader = (element: Element) => {
	visibility: string;
	display: string;
	opacity: string;
};
