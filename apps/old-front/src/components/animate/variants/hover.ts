import type { Transition, Variants } from 'framer-motion';

// ----------------------------------------------------------------------
// Hover-state animation presets.
//
// These differ from the existing var* enter/exit presets (varFade, varScale,
// varZoom): those animate `initial → animate → exit` states; hover presets
// animate `rest → hover` and are designed for `whileHover` on motion
// components.
//
// USAGE
//   const lift = hoverLift();
//   <Box component={m.div} {...asHoverRoot(lift)}>
//     <Box component={m.div} {...hoverZoom()}> // child cascades from parent
//       <Image ... />
//     </Box>
//   </Box>
//
// CONVENTION
//   - Variant keys are always 'rest' | 'hover'.
//   - Each preset returns BOTH variants and a default spring transition.
//   - Override transition by spreading `{ transition: customSpring }` after.
//   - For the ROOT motion element, wrap with `asHoverRoot(...)` to attach
//     `initial`/`animate`/`whileHover` props that drive the cascade.
//   - For CHILD motion elements that should ride the parent's hover, just
//     spread the preset — variants cascade automatically.
// ----------------------------------------------------------------------

type HoverPreset = {
	variants: Variants;
	transition: Transition;
};

// Marketing default — snappy with slight overshoot. Used by:
// PricingTierCard, BlogPostCard (standard + featured).
const DEFAULT_LIFT_SPRING: Transition = {
	type: 'spring',
	stiffness: 320,
	damping: 22,
};

// Cover/image zoom default — slower + heavier so the image settles a beat
// after a parent lift, giving a layered "weighted" hover. Used by:
// BlogPostCard cover, FeaturedHero cover.
const DEFAULT_ZOOM_SPRING: Transition = {
	type: 'spring',
	stiffness: 220,
	damping: 24,
	mass: 0.7,
};

// Padded-cover expansion default — for the "fill card on hover" effect.
// Used by: BlogPostCard cover wrapper.
const DEFAULT_EXPAND_SPRING: Transition = {
	type: 'spring',
	stiffness: 240,
	damping: 26,
	mass: 0.6,
};

// =====================================================================
// PRESETS
// =====================================================================

// Card lift on hover — translateY + scale. Default values match the
// PricingTierCard / BlogPostCard idiom.
//
// Common overrides:
//   hoverLift({ y: -4, scale: 1.01 }) → subtle (large surfaces)
//   hoverLift({ y: -14, scale: 1.025 }) → emphasized (highlighted card)
export const hoverLift = (opts?: {
	y?: number;
	scale?: number;
	transition?: Transition;
}): HoverPreset => {
	const { y = -10, scale = 1.018, transition } = opts ?? {};

	return {
		variants: {
			rest: { y: 0, scale: 1 },
			hover: { y, scale },
		},
		transition: transition ?? DEFAULT_LIFT_SPRING,
	};
};

// Image zoom-in on hover — scales the inner image. Use INSIDE a parent
// motion element that owns the hover state (variants cascade).
//
// Common overrides:
//   hoverZoom({ scale: 1.05 }) → conservative
//   hoverZoom({ scale: 1.10 }) → aggressive
export const hoverZoom = (opts?: {
	scale?: number;
	transition?: Transition;
}): HoverPreset => {
	const { scale = 1.06, transition } = opts ?? {};

	return {
		variants: {
			rest: { scale: 1 },
			hover: { scale },
		},
		transition: transition ?? DEFAULT_ZOOM_SPRING,
	};
};

// Padding collapse on hover — animates 4 padding sides between two values.
// Useful for "image expands to card edge on hover" patterns. Inline rest
// values into the consumer's `sx` so SSR matches before motion takes over.
//
// Common usage:
//   const expand = hoverPadCollapse({ from: 16, to: 0 });
//   <Box component={m.div} {...expand} sx={{ pt: '16px', pl: '16px', pr: '16px' }}>
export const hoverPadCollapse = (opts?: {
	from?: number;
	to?: number;
	sides?: 'all' | 'top-sides';
	transition?: Transition;
}): HoverPreset => {
	const { from = 16, to = 0, sides = 'top-sides', transition } = opts ?? {};

	const restState =
		sides === 'all'
			? {
					paddingTop: from,
					paddingBottom: from,
					paddingLeft: from,
					paddingRight: from,
				}
			: {
					paddingTop: from,
					paddingLeft: from,
					paddingRight: from,
				};

	const hoverState =
		sides === 'all'
			? {
					paddingTop: to,
					paddingBottom: to,
					paddingLeft: to,
					paddingRight: to,
				}
			: {
					paddingTop: to,
					paddingLeft: to,
					paddingRight: to,
				};

	return {
		variants: {
			rest: restState,
			hover: hoverState,
		},
		transition: transition ?? DEFAULT_EXPAND_SPRING,
	};
};

// =====================================================================
// COMPOSITION HELPERS
// =====================================================================

// Wrap a hover preset for use on the ROOT motion element — adds the
// `initial`/`animate`/`whileHover` props that drive the rest→hover cascade.
// Children of the root that pass a hover preset (without these props) will
// automatically follow the root's hover state via variant cascade.
export const asHoverRoot = (preset: HoverPreset) => {
	return {
		...preset,
		initial: 'rest' as const,
		animate: 'rest' as const,
		whileHover: 'hover' as const,
	};
};
