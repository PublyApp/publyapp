/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, test } from 'vitest';

import { Form } from './form';

const FormWithCustomClassName = () => {
	const methods = useForm<{ name: string }>({
		defaultValues: { name: '' },
	});

	return (
		<Form
			methods={methods}
			slotProps={{ form: { className: 'my-custom-form' } }}
		>
			<input name="name" />
		</Form>
	);
};

afterEach(cleanup);

describe('Form', () => {
	test('merges a caller-supplied className with the default instead of dropping it', () => {
		render(<FormWithCustomClassName />);

		const form = document.querySelector('form');
		expect(form).not.toBeNull();
		expect(form?.className).toContain('space-y-4');
		expect(form?.className).toContain('my-custom-form');
	});
});
