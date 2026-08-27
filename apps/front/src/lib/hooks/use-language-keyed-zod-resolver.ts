import { zodResolver } from '@hookform/resolvers/zod';
import type { Namespace } from 'i18next';
import { useMemo } from 'react';
import type { Resolver, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

type Translate = (key: string) => string;

/**
 * Language-keyed memoisation for zod resolvers (#1264).
 *
 * Zod validation messages come from `t()`, so a resolver built once would
 * keep speaking the language the page was first rendered in. Seven forms
 * used to rebuild `zodResolver(...)` under an inline
 * `react-hooks/exhaustive-deps` line suppression, which is exactly what the
 * React Compiler refuses to optimise ("React rule
 * suppression prevents optimization": it skips any hook that disabled a
 * Rules-of-React check).
 *
 * This hook owns the pattern once, with honest exhaustive deps:
 *
 * - `buildSchema` must be a module-level factory (stable identity), which is
 *   how the schema builders were already written;
 * - `t` is recreated whenever its language or namespace catalogue changes,
 *   so `[buildSchema, t]` rebuilds the resolver on language switches and
 *   reloads — strictly more correct than the old `[i18n.language]` alone,
 *   which masked a stale-translation window after a lazy namespace load.
 *
 * No suppression remains, so the compiler can optimise this hook and every
 * component using it.
 */
export const useLanguageKeyedZodResolver = <TFieldValues extends FieldValues>(
	buildSchema: (t: Translate) => z.ZodType,
	namespace?: Namespace,
): Resolver<TFieldValues> => {
	const { t } = useTranslation(namespace);

	return useMemo(
		// zodResolver v5 keys its overloads on the schema's concrete input
		// type, which this hook's `Translate`-erased signature cannot carry.
		// One explicit cast at this single seam (pre-existing pattern).
		() =>
			zodResolver(
				buildSchema(t) as Parameters<typeof zodResolver>[0],
			) as Resolver<TFieldValues>,
		[buildSchema, t],
	);
};
