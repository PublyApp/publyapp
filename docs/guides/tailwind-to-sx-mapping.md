# Tailwind → MUI sx Mapping (Marketing Canvases)

Lookup for translating AIDesigner canvas markup (Tailwind) into MUI v6 `sx`.
This file grows phase by phase — append rows when a new pattern appears in a
canvas you are translating. If a pattern appears in only one place across all
14 canvases, it does not need a row.

## Spacing & sizing

| Tailwind | sx equivalent | Notes |
|---|---|---|
| `p-6 md:p-7` | `sx={{ p: { xs: 3, md: 3.5 } }}` | MUI spacing unit = 8px |
| `aspect-[16/10]` | `sx={{ aspectRatio: '16 / 10' }}` | |
| `max-w-[1100px]` | `sx={{ maxWidth: 1100 }}` | The blog body+sidebar combined width |
| `max-w-3xl` | `sx={{ maxWidth: 768 }}` | Tailwind 3xl |
| `gap-6` | `sx={{ gap: 3 }}` | |

## Radii

| Tailwind | sx equivalent |
|---|---|
| `rounded-[24px]` | `borderRadius: '24px'` |
| `rounded-[16px]` | `borderRadius: '16px'` |
| `rounded-[32px]` | `borderRadius: '32px'` |
| `rounded-full` | `borderRadius: 999` |

## Shadows (marketing tokens)

| Canvas token | sx |
|---|---|
| `shadow-card-rest` | `boxShadow: '0 1px 2px rgba(31,41,55,0.03)'` |
| `shadow-card-hover` | `boxShadow: '0 20px 40px -15px rgba(31,41,55,0.12)'` |

## Color tokens (canvas → theme)

Where a canvas class maps to a theme token, prefer the token — but only certain
tokens dark-swap automatically. Use these and the surface adapts; reach for
`varAlpha` overlays when a fixed-ramp token would otherwise stick out in dark mode.

| Canvas class | Theme token | Dark-swaps? |
|---|---|---|
| `text-slate-600`, `text-brand-muted` | `color: 'text.secondary'` | ✓ |
| `text-slate-900`, `text-brand-dark` | `color: 'text.primary'` | ✓ |
| `border-brand-border`, `border-slate-200` | `borderColor: 'divider'` | ✓ |
| `bg-white` (card surface) | `bgcolor: 'background.paper'` | ✓ |
| `bg-slate-50` (panel surface) | `bgcolor: 'background.neutral'` | ✓ |
| `bg-brand-bg` (page bg) | `bgcolor: 'background.default'` | ✓ |

### `grey.X` does NOT dark-swap

`grey.50`/`grey.100`/.../`grey.900` are **static** values from the palette ramp
(`'#FAFBFC'`, `'#F3F4F6'`, …). They look fine in light mode and broken in dark
mode (light-gray pills on a near-black page). Avoid them for surface backgrounds.

For subtle tints that should adapt to mode, use a `varAlpha` overlay on a token
that DOES swap:

| Need | sx (dark-safe) |
|---|---|
| Tag chip bg (was `bg-slate-100` / `grey.100`) | `bgcolor: varAlpha(theme.vars.palette.text.primaryChannel, 0.04)` |
| Disabled-pill bg (was `bg-gray-100` / `grey.100`) | `bgcolor: varAlpha(theme.vars.palette.text.primaryChannel, 0.08)` |
| Subtle panel bg (was `bg-gray-50` / `grey.50`) | `bgcolor: 'background.neutral'` |

`common.black` / `common.white` are intentionally fixed (true black, true
white). Use them deliberately, e.g. text on a `#242424` always-dark surface.

## Group hover (parent-triggered child transitions)

Tailwind `group` + `group-hover:scale-[1.03]` requires a parent with `group`
class plus children that respond. In `sx`, the parent owns the hover trigger
via a class selector; the child `className` is used only as a selector hook,
not for styling.

```tsx
<Box
  sx={{
    '&:hover .pricing-card-img': { transform: 'scale(1.03)' },
  }}
>
  <Box
    className="pricing-card-img"
    sx={{ transition: 'transform 500ms' }}
  >
    {/* ... */}
  </Box>
</Box>
```

This is the only sanctioned use of `className` in marketing surface code.

## Iconify icon names

Canvas markup uses the Tailwind/CDN convention `'ph-fill:tag'`, `'ph-bold:check'`.
Our registered icon set (`apps/front/src/components/iconify/icon-sets.ts`) uses
the colon-after-prefix Phosphor convention: `'ph:tag-fill'`, `'ph:check-bold'`.

| Canvas markup | Use in code |
|---|---|
| `<i class="ph ph-tag">` | `<Iconify icon="ph:tag" />` |
| `<i class="ph-fill ph-tag">` | `<Iconify icon="ph:tag-fill">` |
| `<i class="ph-bold ph-check">` | `<Iconify icon="ph:check-bold">` |
| `<i class="ph-fill ph-check-circle">` | `<Iconify icon="ph:check-circle-fill">` |
| `<i class="ph-bold ph-x">` | `<Iconify icon="ph:x-bold">` |
| `<i class="ph-bold ph-plus">` | `<Iconify icon="ph:plus-bold">` |

Unknown icon names trigger a runtime warning AND a network fetch (visible
flicker on first paint). **Never use `as never` to silence the TypeScript
error** — that just hides the bug and the icon falls back to network. If TS
complains, the name is wrong; either correct it or register the icon in
`icon-sets.ts`.

## Brand-color literals → varAlpha

Hardcoded primary-tinted shadows like `rgba(16, 185, 129, 0.4)` shouldn't be
literal — that's the current `primary.main` hex. Use `varAlpha` so brand
shifts propagate.

| Avoid | Prefer |
|---|---|
| `boxShadow: '0 10px 30px rgba(16,185,129,0.4)'` | `boxShadow: \`0 10px 30px ${varAlpha(theme.vars.palette.primary.mainChannel, 0.4)}\`` |
| `borderColor: 'rgba(16,185,129,0.5)'` | `borderColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.5)` |

Approved exceptions (gray/black shadow recipes, third-party brand colors,
the `#242424` always-dark surface) are listed in
`docs/guides/marketing-surface-conventions.md`.

## Animations

- **No perpetual animations.** No shimmer, no marching skeleton effects, no
  always-on motion. Decided 2026-04-30 after the cover-types canvas review.
- Hover transitions: only `transform` and `boxShadow` change on hover. Background,
  text color, and border color stay stable. (Per
  `docs/guides/marketing-surface-conventions.md`.)

```tsx
sx={{
  transition: 'all 500ms',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 20px 40px -15px rgba(31,41,55,0.12)',
  },
}}
```

### Spring physics for marketing micro-interactions

Tuned values from the home + /pricing build, by interaction type:

| Interaction | spring config |
|---|---|
| CTA button hover lift | `{ stiffness: 400, damping: 18 }` (parent), `{ stiffness: 500, damping: 14–16 }` (inner icon) |
| Card hover lift | `{ stiffness: 280–300, damping: 20–22, y: -8 to -12, scale: 1.01–1.03 }` |
| Toggle thumb slide | `transition: 'transform 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)'` |
| FAQ card open (whole card scale + lift) | `{ type: 'spring', stiffness: 700, damping: 30, mass: 0.4 }` |
| FAQ body height expand | `{ type: 'spring', stiffness: 700, damping: 38, mass: 0.45 }` |
| FAQ icon plus↔X swap rotation | `{ type: 'spring', stiffness: 600, damping: 18, mass: 0.5 }` |

Snappy + physical = high stiffness (500+) with low mass (0.4–0.5). Bouncy = low
damping (16–22). Settled = high damping (28–38).

## Dark-mode override convention

Where the dark canvas (when one exists) shows a deliberate divergence from
the light canvas that theme tokens cannot express, add an explicit override
prefixed by a `// dark-diff:` comment so future readers know the override is
intentional.

```tsx
sx={(theme) => ({
  background: `radial-gradient(... ${theme.palette.primary.main} ...)`,
  // dark-diff: dark canvas uses a denser glow + cooler edge
  ...theme.applyStyles('dark', {
    background: `radial-gradient(... ${varAlpha(theme.vars.palette.primary.mainChannel, 0.4)} ...)`,
  }),
})}
```

The `// dark-diff:` comment is the only routinely-allowed comment in
marketing surface code (per `AGENTS.md`'s "default to no comments" rule).
