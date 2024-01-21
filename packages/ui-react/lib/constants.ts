export const ENABLE_TABLE_INLINE_EDITING = false;

export const getParseCurrentUserLocalStorageKey = (appId: string) => {
	return `Parse/${appId}/currentUser`;
};
