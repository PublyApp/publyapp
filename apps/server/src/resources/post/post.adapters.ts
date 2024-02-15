// import type { AppLocale } from '@/shared/lib/i18n/resources';
// import type { ParsePost } from '@/shared/lib/parse/classes/post.class';
// import type { TranslatedIPostWithParseRelations } from '@/shared/types/db/post.types';

// const boPostsTable = (input: ParsePost[], { locale }: { locale: AppLocale }) => {
// 	return input.map((post) => {
// 		return {
// 			...post.toJSON(),
// 			...post.attributes.translation[locale],
// 		} as unknown as TranslatedIPostWithParseRelations;
// 	});
// };

// const postAdapter = {
// 	boPostsTable,
// } as const;

// export default postAdapter;
