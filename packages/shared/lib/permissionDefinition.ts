// import _ from 'lodash';

// type PermissionDefinitionBluePrint = {
// 	tenant: {
// 		classes: string[];
// 		verbs: string[];
// 	};
// 	staff: {
// 		classes: string[];
// 		verbs: string[];
// 	};
// };

// const permissionDefinition = {
// 	tenant: {
// 		classes: ['_User', 'Stuff'],
// 		verbs: ['canDoStuff', 'canDoOtherStuff'],
// 	},
// 	staff: {
// 		classes: ['_User', 'Stuff'],
// 		verbs: ['canDoStuff', 'canDoOtherStuff'],
// 	},
// } as const satisfies PermissionDefinitionBluePrint;

// type PermissionDefinition = typeof permissionDefinition;

// type ClassLiteral<T extends 'tenant' | 'staff', D extends 'classes' | 'verbs'> = PermissionDefinition[T][D][number];

// type ClassOperation<T> = {
// 	create: T;
// 	read: T;
// 	update: T;
// 	delete: T;
// 	publish: T;
// };

// type TenantPermission<T> = {
// 	class: Record<ClassLiteral<'tenant', 'classes'>, ClassOperation<T>>;
// 	verb: Record<ClassLiteral<'tenant', 'verbs'>, T>;
// };

// type StaffPermission<T> = {
// 	class: Record<ClassLiteral<'staff', 'classes'>, ClassOperation<T>>;
// 	verb: Record<ClassLiteral<'staff', 'verbs'>, T>;
// };

//
// type _PermissionType<T> = {
// 	tenant: TenantPermission<T>;
// 	staff: StaffPermission<T>;
// };

// export type PermissionType = DeepPartial<_PermissionType<boolean>>;

// type PermissionSelectorType = _PermissionType<string>;

// export const ALL_SELECTORS = new Set<string>();

// export const permissionSelector: PermissionSelectorType = (() => {
// 	const selectors: Record<string, unknown> = {};
// 	const perms = permissionDefinition;
// 	_.forEach(_.entries(perms), (entry) => {
// 		const [key, values] = entry;
// 		const nestedPerms = {};

// 		_.forEach(values.classes as string[], (className) => {
// 			const prefix = `${key}.class`;
// 			const operations: (keyof ClassOperation<unknown>)[] = ['create', 'read', 'update', 'delete', 'publish'];

// 			_.forEach(operations, (operation) => {
// 				const selector = `${prefix}.${className}.${operation}`;
// 				_.set(nestedPerms, `class.${className}.${operation}`, selector);
// 				ALL_SELECTORS.add(selector);
// 			});
// 		});

// 		_.forEach(values.verbs as string[], (verb) => {
// 			const prefix = `${key}.verb`;
// 			const selector = `${prefix}.${verb}`;

// 			_.set(nestedPerms, `verb.${verb}`, selector);
// 			ALL_SELECTORS.add(selector);
// 		});

// 		_.set(selectors, key, nestedPerms);
// 	});
// 	return selectors as never;
// })();
