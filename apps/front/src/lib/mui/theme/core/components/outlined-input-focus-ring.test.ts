import assert from 'node:assert/strict';
import test from 'node:test';

import { outlinedInputClasses } from '@mui/material/OutlinedInput';
import { pickersOutlinedInputClasses } from '@mui/x-date-pickers/PickersTextField';

import { createTheme } from '#app/lib/mui/theme/create-theme.ts';

test('outlined inputs use a 2px focused outline across standard and picker fields', () => {
	const theme = createTheme();

	const outlinedRoot = theme.components?.MuiOutlinedInput?.styleOverrides
		?.root as
		| ((props: unknown) => Record<string, unknown>)
		| Record<string, unknown>
		| undefined;
	const outlinedStyles =
		typeof outlinedRoot === 'function'
			? outlinedRoot({ theme, ownerState: {} })
			: outlinedRoot;
	const outlinedFocusedStyles = (
		outlinedStyles?.[`&.${outlinedInputClasses.focused}`] as
			| Record<string, unknown>
			| undefined
	)?.[`& .${outlinedInputClasses.notchedOutline}`] as
		| Record<string, unknown>
		| undefined;

	assert.ok(outlinedFocusedStyles, 'expected MuiOutlinedInput focused styles');
	assert.equal(
		outlinedFocusedStyles.borderWidth,
		'2px',
		'expected MuiOutlinedInput focus ring to be 2px',
	);

	const pickersRoot = theme.components?.MuiPickersOutlinedInput?.styleOverrides
		?.root as
		| ((props: unknown) => Record<string, unknown>)
		| Record<string, unknown>
		| undefined;
	const pickersStyles =
		typeof pickersRoot === 'function'
			? pickersRoot({ theme, ownerState: {} })
			: pickersRoot;
	const pickersFocusedStyles = pickersStyles?.[
		`&.${pickersOutlinedInputClasses.focused} .${pickersOutlinedInputClasses.notchedOutline}`
	] as Record<string, unknown> | undefined;

	assert.ok(
		pickersFocusedStyles,
		'expected MuiPickersOutlinedInput focused styles',
	);
	assert.equal(
		pickersFocusedStyles.borderWidth,
		2,
		'expected MuiPickersOutlinedInput focus ring to be 2px',
	);
});
