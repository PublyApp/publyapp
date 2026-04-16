import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const GENERATED_HOMEPAGE_MIN_VARIANTS = 1;
export const GENERATED_HOMEPAGE_MAX_VARIANTS = 200;

const GENERATED_HOMEPAGE_ROUTE_SEGMENT = 'homepage-gen';
const GENERATED_HOMEPAGE_MANIFEST_RELATIVE_PATH =
	'apps/front/src/generated/homepage-gen/manifest.json';
const GENERATED_HOMEPAGE_PAGES_RELATIVE_DIR =
	'apps/front/src/generated/homepage-gen/pages';

const pathExists = async (targetPath) => {
	try {
		await access(targetPath);

		return true;
	} catch {
		return false;
	}
};

const assertBatchVariants = (variants) => {
	if (
		!Number.isInteger(variants) ||
		variants < GENERATED_HOMEPAGE_MIN_VARIANTS ||
		variants > GENERATED_HOMEPAGE_MAX_VARIANTS
	) {
		throw new Error(
			`Variants must be an integer between ${GENERATED_HOMEPAGE_MIN_VARIANTS} and ${GENERATED_HOMEPAGE_MAX_VARIANTS}.`,
		);
	}
};

const readGeneratedHomepageManifest = async (manifestPath) => {
	if (!(await pathExists(manifestPath))) {
		return [];
	}

	const raw = await readFile(manifestPath, 'utf8');
	const manifest = JSON.parse(raw);

	if (!Array.isArray(manifest)) {
		throw new Error('Generated homepage manifest must be an array.');
	}

	return manifest;
};

const buildGeneratedHomepageComponentName = (id) => {
	return `GeneratedHomepage${String(id).padStart(4, '0')}Page`;
};

export const buildGeneratedHomepageComponentFileName = (id) => {
	return `generated-homepage-${String(id).padStart(4, '0')}.tsx`;
};

export const buildGeneratedHomepageRoutePath = (id) => {
	return `/${GENERATED_HOMEPAGE_ROUTE_SEGMENT}/${id}`;
};

const buildGeneratedHomepageTemplate = ({ id, routePath }) => {
	const componentName = buildGeneratedHomepageComponentName(id);

	return `import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const ${componentName} = () => {
\treturn (
\t\t<Box
\t\t\tsx={{
\t\t\t\tbgcolor: 'background.default',
\t\t\t\tcolor: 'text.primary',
\t\t\t\tminHeight: '100vh',
\t\t\t\tpy: { xs: 10, md: 14 },
\t\t\t}}
\t\t>
\t\t\t<Container maxWidth="lg">
\t\t\t\t<Stack spacing={3}>
\t\t\t\t\t<Typography variant="overline" sx={{ letterSpacing: '0.2em' }}>
\t\t\t\t\t\tGenerated Homepage Slot ${id}
\t\t\t\t\t</Typography>
\t\t\t\t\t<Typography variant="h1">
\t\t\t\t\t\tGenerated homepage ${id} is ready for implementation.
\t\t\t\t\t</Typography>
\t\t\t\t\t<Typography color="text.secondary" variant="h5">
\t\t\t\t\t\tReplace this scaffold with the generated marketing page for route: ${routePath}
\t\t\t\t\t</Typography>
\t\t\t\t</Stack>
\t\t\t</Container>
\t\t</Box>
\t);
};

export default ${componentName};
`;
};

export const prepareGeneratedHomepageBatch = async ({
	repoRoot,
	variants,
	batchLabel = null,
	now = () => new Date().toISOString(),
}) => {
	assertBatchVariants(variants);

	const manifestPath = path.join(
		repoRoot,
		GENERATED_HOMEPAGE_MANIFEST_RELATIVE_PATH,
	);
	const pagesDir = path.join(repoRoot, GENERATED_HOMEPAGE_PAGES_RELATIVE_DIR);
	const existingManifest = await readGeneratedHomepageManifest(manifestPath);
	let maxExistingId = 0;

	for (const entry of existingManifest) {
		if (Number.isInteger(entry.id) && entry.id > maxExistingId) {
			maxExistingId = entry.id;
		}
	}

	await mkdir(path.dirname(manifestPath), { recursive: true });
	await mkdir(pagesDir, { recursive: true });

	const createdEntries = [];

	for (let offset = 1; offset <= variants; offset += 1) {
		const id = maxExistingId + offset;
		const fileName = buildGeneratedHomepageComponentFileName(id);
		const routePath = buildGeneratedHomepageRoutePath(id);
		const pagePath = path.join(pagesDir, fileName);

		if (await pathExists(pagePath)) {
			throw new Error(`Generated homepage file already exists: ${fileName}`);
		}

		await writeFile(
			pagePath,
			buildGeneratedHomepageTemplate({ id, routePath }),
			'utf8',
		);

		createdEntries.push({
			id,
			title: `Generated Homepage ${id}`,
			fileName,
			routePath,
			batchLabel,
			createdAt: now(),
		});
	}

	const nextManifest = [...existingManifest, ...createdEntries];

	await writeFile(manifestPath, JSON.stringify(nextManifest, null, 2), 'utf8');

	return {
		manifest: nextManifest,
		createdEntries,
		manifestPath,
		pagesDir,
	};
};
