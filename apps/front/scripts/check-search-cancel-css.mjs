import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertShippedSourceSearchCancelCss } from './search-cancel-css-policy.mjs';

const frontRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceFileCount = assertShippedSourceSearchCancelCss(frontRoot);

console.log(
	`front search-cancel source policy: 1 canonical rule across ` +
		`${sourceFileCount} frontend source tree file(s).`,
);
