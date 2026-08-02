/**
 * The tick ruler (§4 Row 09 / Row 12, §6): a decorative measuring band, used
 * exactly twice on the page — never a third time, or it stops being a
 * structural motif and becomes a texture. Minor ticks every 24px, major
 * ticks every 120px (every fifth). Purely decorative: `aria-hidden`, no
 * i18n key, no user-visible text.
 */
export const TickRuler = () => (
	<div aria-hidden="true" className="h-16 w-full overflow-hidden md:h-24">
		{/* x1="0.5" is deliberate: a 1px stroke centred on an integer
		    coordinate renders as two blurred half-pixels on non-retina
		    displays (§4 Row 09). */}
		<svg
			width="100%"
			height="100%"
			preserveAspectRatio="none"
			focusable="false"
		>
			<defs>
				<pattern
					id="ld07-rule-minor"
					width="24"
					height="96"
					patternUnits="userSpaceOnUse"
				>
					<line
						x1="0.5"
						y1="96"
						x2="0.5"
						y2="80"
						stroke="var(--publy-rule)"
						strokeWidth="1"
					/>
				</pattern>
				<pattern
					id="ld07-rule-major"
					width="120"
					height="96"
					patternUnits="userSpaceOnUse"
				>
					<line
						x1="0.5"
						y1="96"
						x2="0.5"
						y2="56"
						stroke="var(--publy-rule-strong)"
						strokeWidth="1"
					/>
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill="url(#ld07-rule-minor)" />
			<rect width="100%" height="100%" fill="url(#ld07-rule-major)" />
		</svg>
	</div>
);
