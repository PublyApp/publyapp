import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	SHIPPED_SOURCE_ROOTS,
	assertShippedSourceSearchCancelCss,
} from './search-cancel-css-policy.mts';

const workspaceRoot = path.resolve(
	fileURLToPath(new URL('../../../..', import.meta.url)),
);
const { inventoriedMentionCount, inventorySize, sourceFileCount } =
	assertShippedSourceSearchCancelCss(workspaceRoot);

console.log(
	`front search-cancel source policy: 1 canonical rule across ` +
		`${sourceFileCount} scanned source file(s) in ` +
		`${SHIPPED_SOURCE_ROOTS.length} root(s) ` +
		`(${SHIPPED_SOURCE_ROOTS.join(', ')}); ` +
		`${inventoriedMentionCount} inventoried mention(s) across ` +
		`${inventorySize} inventoried file(s).`,
);
