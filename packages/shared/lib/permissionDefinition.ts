import _ from 'lodash';

type PermissionDefinitionBluePrint = {
	tenant: {
		classes: string[];
		verbs: string[];
	};
	staff: {
		classes: string[];
		verbs: string[];
	};
};

const permissionDefinition = {
	tenant: {
		classes: ['_User', 'Stuff'],
		verbs: ['canDoStuff', 'canDoOtherStuff'],
	},
	staff: {
		classes: ['_User', 'Stuff'],
		verbs: ['canDoStuff', 'canDoOtherStuff'],
	},
} as const satisfies PermissionDefinitionBluePrint;

type PermissionDefinition = typeof permissionDefinition;

type ClassLiteral<T extends 'tenant' | 'staff', D extends 'classes' | 'verbs'> = PermissionDefinition[T][D][number];

type ClassOperation<T> = {
	create: T;
	read: T;
	update: T;
	delete: T;
	publish: T;
};

type TenantPermission<T> = {
	class: Record<ClassLiteral<'tenant', 'classes'>, ClassOperation<T>>;
	verb: Record<ClassLiteral<'tenant', 'verbs'>, T>;
};

type StaffPermission<T> = {
	class: Record<ClassLiteral<'staff', 'classes'>, ClassOperation<T>>;
	verb: Record<ClassLiteral<'staff', 'verbs'>, T>;
};

// eslint-disable-next-line @typescript-eslint/naming-convention
type _PermissionType<T> = {
	tenant: TenantPermission<T>;
	staff: StaffPermission<T>;
};

export type PermissionType = DeepPartial<_PermissionType<boolean>>;

type PermissionSelectorType = _PermissionType<string>;

export const permissionSelector: PermissionSelectorType = (() => {
	const selectors: Record<string, unknown> = {};
	const perms = permissionDefinition;
	_.forEach(_.entries(perms), (entry) => {
		const [key, value] = entry;
		const nestedPerms = {};
		_.set(selectors, key, nestedPerms);
	});
	return selectors as never;
})();
