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

Where a canvas class maps to a theme token, prefer the token — it dark-swaps
automatically. Only fall back to a literal hex if a `// dark-diff:` override
demands it.

| Canvas class | Theme token |
|---|---|
| `text-slate-600`, `text-brand-muted` | `color: 'text.secondary'` |
| `text-slate-900`, `text-brand-dark` | `color: 'text.primary'` |
| `bg-slate-100` (tag chips) | `bgcolor: 'grey.100'` |
| `border-brand-border`, `border-slate-200` | `borderColor: 'divider'` |
| `bg-white` (card surface) | `bgcolor: 'background.paper'` |
| `bg-brand-bg` (page bg) | `bgcolor: 'background.default'` |

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
