# Composition in PublyApp (`apps/front`)

The rule itself is defined once in radan-ui and linked from [`AGENTS.md`](../../AGENTS.md) (« Shared UI rules »). This
file only records how PublyApp applies it.

## Compounds that already exist locally

- `apps/front/src/components/ui/card.tsx` exports the parts as flat named exports: `Card`, `CardHeader`,
  `CardTitle`, `CardAction`, `CardContent`, `CardFooter`. The caller composes the parts it needs, for example
  `security.tsx` in `routes/authed/tenant/settings/`.
- New compounds follow the form their neighbours use. In `card.tsx` that means flat named parts, not a `Card.Header`
  namespace.

## Scope and migration

- The rule applies to new and changed components.
- An existing component that still takes boolean or part-toggle props is fixed when its file is touched. There is no separate sweep.
- A reviewer treats a new part-toggle flag (`hasThumb`, `showPill`, `withFooter`, `variant="card|row"`) as a finding.

## Lint

A shared lint rule, `house/no-boolean-prop-soup`, is planned in the common lint set
([radandevist/radan-ui#50](https://github.com/radandevist/radan-ui/issues/50)). It has no date yet.
