# Composition and Compound Components (HARD)

> **Level: HARD.** Binding on all contributors (human and AI), for `apps/front`. Bound from
> [`AGENTS.md`](../../AGENTS.md). The full front rule lives in
> [`front/conventions.md`](front/conventions.md) (« Composition and Compound Components »); the same
> rule is used in ShopKartOS and radan-ui.

## The rule

Build UI by composing small components through `children`. A component with parts is a **compound
component**: the caller composes the parts it needs, and the shape comes from the composition itself.
The parent owns the shared state; the parts read it through context when they truly need it.

It applies to **new and changed components**. An existing violation (a boolean-prop component) is fixed
when you touch that file, not in a separate sweep.

- **No boolean-prop soup.** `hasThumb`, `showPill`, `withFooter`, `variant="card|row"` mean several
  components are wearing one coat. Split the component, or make it a compound.
- **Props describe data, not which parts exist.** A layout prop the real element also has (`size`,
  `lines`, `open`) is fine. A prop that only switches a chunk of markup on or off is not.
- **Shared state flows through context**, not through prop drilling into every part.
- **Compose, don't fork.** A page assembles library parts. It never redraws a component with its own
  markup.

## Naming

PublyApp's `components/ui/card.tsx` exports its parts as flat named exports (`CardHeader`,
`CardTitle`, `CardContent`, `CardFooter`), not as `Card.Header`. Both forms are compounds. When you
add a compound, use the form its neighbours already use.

## Example: a real compound (good)

From `apps/front/src/components/ui/card.tsx`, used in
`routes/authed/tenant/settings/security.tsx`. The card's shape is the parts the caller composes:

```tsx
<Card>
	<CardHeader>
		<CardTitle>{title}</CardTitle>
	</CardHeader>
	<CardContent>{body}</CardContent>
</Card>
```

If the card needs a footer, the caller adds `<CardFooter>`. It does not get a `withFooter` prop.

## Example: boolean-prop soup (bad → good)

Bad: one component that switches its own markup with flags.

```tsx
<InfoCard title={title} hasThumb showPill pillTone={status} variant="row" />
```

Good: the caller composes the parts it needs.

```tsx
<Card>
	<CardHeader>
		<CardTitle>{title}</CardTitle>
		<Pill tone={status} />
	</CardHeader>
	<CardContent>{body}</CardContent>
</Card>
```

## Lint

A shared lint rule, `house/no-boolean-prop-soup`, is planned for the common lint set
([radandevist/radan-ui#50](https://github.com/radandevist/radan-ui/issues/50)). No date is set. Until it
lands, this rule is enforced by review.
