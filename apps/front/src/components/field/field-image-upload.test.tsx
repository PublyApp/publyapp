/**
 * @vitest-environment jsdom
 */
import { zodResolver } from '@hookform/resolvers/zod';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	useUploadStaffImageMutation: vi.fn(),
	toastSuccess: vi.fn(),
	API_ORIGIN: 'https://api.test.example',
}));

vi.mock('~/lib/mutation-toast', () => ({
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
	},
}));

vi.mock('~/lib/query/staff-uploads', () => ({
	useUploadStaffImageMutation: mocks.useUploadStaffImageMutation,
}));

vi.mock('~/lib/api-client/resolve-api-file-url', () => ({
	resolveApiFileUrl: (value: string) =>
		value.startsWith('/files/') ? `${mocks.API_ORIGIN}${value}` : value,
}));

const API_ORIGIN = mocks.API_ORIGIN;

vi.mock('~/components/ui/button', () => ({
	Button: ({
		children,
		type,
		onClick,
		disabled,
		...props
	}: {
		children: ReactNode;
		type?: 'button' | 'submit' | 'reset';
		onClick?: () => void;
		disabled?: boolean;
	}) =>
		createElement(
			'button',
			{ type: type ?? 'button', onClick, disabled, ...props },
			children,
		),
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: TestLabelMap = {
				'drag-image-here': 'Drag an image here, or',
				browse: 'browse',
				'uploading-logo': 'Uploading…',
				'logo-upload-hint': 'PNG, JPEG, WEBP, or GIF — up to 2 MB',
				'logo-upload-invalid-type': 'Image must be PNG, JPEG, WEBP, or GIF',
				'logo-upload-too-large': 'Image must be 2 MB or smaller',
				'logo-upload-failed': "Couldn't upload the image. Please try again.",
				'image-uploaded-success': 'Image uploaded successfully.',
				'clear-logo': 'Clear logo',
			};

			return labels[key] ?? key;
		},
	}),
}));

import { Field } from './fields';
import { Form } from './form';

const PNG_TYPE = 'image/png';

const buildFile = (
	name: string,
	sizeBytes: number,
	type: string = PNG_TYPE,
): File => {
	const file = new File([new Uint8Array(sizeBytes)], name, { type });
	Object.defineProperty(file, 'size', { value: sizeBytes });
	return file;
};

const ImageUploadHarness = ({
	helperText,
}: {
	helperText?: string;
} = {}) => {
	const methods = useForm({ defaultValues: { logoUrl: '' } });

	return (
		<Form methods={methods} onSubmit={methods.handleSubmit(() => undefined)}>
			<Field.ImageUpload
				name="logoUrl"
				label="Logo"
				previewName="Acme"
				helperText={helperText}
			/>
			<output data-testid="logo-url-value">{methods.watch('logoUrl')}</output>
			<output data-testid="is-dirty">
				{String(methods.formState.isDirty)}
			</output>
		</Form>
	);
};

const RequiredImageUploadHarness = () => {
	const methods = useForm({
		resolver: zodResolver(
			z.object({ logoUrl: z.string().min(1, 'Logo is required') }),
		),
		defaultValues: { logoUrl: '' },
	});

	return (
		<Form methods={methods} onSubmit={methods.handleSubmit(() => undefined)}>
			<Field.ImageUpload name="logoUrl" label="Logo" previewName="Acme" />
			<button type="submit">Submit</button>
			<output data-testid="touched-logo-url">
				{String(Boolean(methods.formState.touchedFields.logoUrl))}
			</output>
		</Form>
	);
};

describe('Field.ImageUpload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	// shell-r5-F4: the file input forwarded no `field.ref`/`name`/`onBlur`,
	// so RHF's submit-time focus-on-invalid had nowhere to land and the
	// field's touched state never flipped on blur.
	test('RHF focuses the file input on a submit-time validation error', async () => {
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		});

		render(<RequiredImageUploadHarness />);

		fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => {
			expect(document.activeElement).toBe(screen.getByLabelText('Logo'));
		});
	});

	test('carries the RHF field name and marks the field touched on blur', () => {
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		});

		render(<RequiredImageUploadHarness />);

		const input = screen.getByLabelText('Logo') as HTMLInputElement;
		expect(input.name).toBe('logoUrl');

		fireEvent.blur(input);

		expect(screen.getByTestId('touched-logo-url').textContent).toBe('true');
	});

	test('rejects a file with a disallowed MIME type without uploading', () => {
		const mutate = vi.fn();
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate,
			isPending: false,
		});

		render(<ImageUploadHarness />);

		const input = screen.getByLabelText('Logo') as HTMLInputElement;
		fireEvent.change(input, {
			target: { files: [buildFile('logo.svg', 1000, 'image/svg+xml')] },
		});

		expect(mutate).not.toHaveBeenCalled();
		expect(
			screen.getByText('Image must be PNG, JPEG, WEBP, or GIF'),
		).toBeTruthy();
		expect(screen.getByTestId('logo-url-value').textContent).toBe('');
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('rejects a file over the 2 MB size limit without uploading', () => {
		const mutate = vi.fn();
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate,
			isPending: false,
		});

		render(<ImageUploadHarness />);

		const input = screen.getByLabelText('Logo') as HTMLInputElement;
		fireEvent.change(input, {
			target: { files: [buildFile('logo.png', 2_000_001)] },
		});

		expect(mutate).not.toHaveBeenCalled();
		expect(screen.getByText('Image must be 2 MB or smaller')).toBeTruthy();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('a successful upload sets the field value and marks the form dirty', async () => {
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate: (
				_input: unknown,
				opts: { onSuccess: (result: { url: string }) => void },
			) => {
				opts.onSuccess({ url: '/files/uploads/2026/07/logo.png' });
			},
			isPending: false,
		});

		render(<ImageUploadHarness />);

		const input = screen.getByLabelText('Logo') as HTMLInputElement;
		fireEvent.change(input, {
			target: { files: [buildFile('logo.png', 1000)] },
		});

		await waitFor(() => {
			expect(screen.getByTestId('logo-url-value').textContent).toBe(
				`${API_ORIGIN}/files/uploads/2026/07/logo.png`,
			);
		});
		expect(screen.getByTestId('is-dirty').textContent).toBe('true');
		expect(screen.getByTestId('logo-upload-url').textContent).toBe(
			`${API_ORIGIN}/files/uploads/2026/07/logo.png`,
		);
		expect(mocks.toastSuccess).toHaveBeenCalledOnce();
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Image uploaded successfully.',
		);
	});

	test('surfaces an inline error when a successful upload response has no url (r3-tests-F15)', async () => {
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate: (
				_input: unknown,
				opts: { onSuccess: (result: { url?: string }) => void },
			) => {
				opts.onSuccess({});
			},
			isPending: false,
		});

		render(<ImageUploadHarness />);

		const input = screen.getByLabelText('Logo') as HTMLInputElement;
		fireEvent.change(input, {
			target: { files: [buildFile('logo.png', 1000)] },
		});

		await waitFor(() => {
			expect(
				screen.getByText("Couldn't upload the image. Please try again."),
			).toBeTruthy();
		});
		expect(screen.getByTestId('logo-url-value').textContent).toBe('');
		expect(screen.getByTestId('is-dirty').textContent).toBe('false');
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('treats a whitespace-only upload url as unusable without a toast', async () => {
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate: (
				_input: unknown,
				opts: { onSuccess: (result: { url?: string }) => void },
			) => {
				opts.onSuccess({ url: '   ' });
			},
			isPending: false,
		});

		render(<ImageUploadHarness />);

		fireEvent.change(screen.getByLabelText('Logo') as HTMLInputElement, {
			target: { files: [buildFile('logo.png', 1000)] },
		});

		await waitFor(() => {
			expect(
				screen.getByText("Couldn't upload the image. Please try again."),
			).toBeTruthy();
		});
		expect(screen.getByTestId('logo-url-value').textContent).toBe('');
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('surfaces a server upload failure inline', async () => {
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate: (
				_input: unknown,
				opts: { onError: (error: unknown) => void },
			) => {
				opts.onError({
					status: 422,
					title: 'Invalid upload file',
					detail: 'File exceeds the maximum size of 2000000 bytes.',
					errors: { file: ['File exceeds the maximum size of 2000000 bytes.'] },
				});
			},
			isPending: false,
		});

		render(<ImageUploadHarness />);

		const input = screen.getByLabelText('Logo') as HTMLInputElement;
		fireEvent.change(input, {
			target: { files: [buildFile('logo.png', 1000)] },
		});

		await waitFor(() => {
			expect(
				screen.getByText('File exceeds the maximum size of 2000000 bytes.'),
			).toBeTruthy();
		});
		expect(screen.getByTestId('logo-url-value').textContent).toBe('');
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('shows a busy state while the upload is pending', () => {
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate: vi.fn(),
			isPending: true,
		});

		render(<ImageUploadHarness />);

		expect(screen.getByText('Uploading…')).toBeTruthy();
		expect((screen.getByLabelText('Logo') as HTMLInputElement).disabled).toBe(
			true,
		);
	});

	test('renders the passed helperText when there is neither a field error nor a local error', () => {
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		});

		render(<ImageUploadHarness helperText="PNG or JPG, max 2 MB" />);

		expect(screen.getByText('PNG or JPG, max 2 MB')).toBeTruthy();
	});

	test('clearing an uploaded logo empties the field', () => {
		mocks.useUploadStaffImageMutation.mockReturnValue({
			mutate: (
				_input: unknown,
				opts: { onSuccess: (result: { url: string }) => void },
			) => {
				opts.onSuccess({ url: '/files/uploads/2026/07/logo.png' });
			},
			isPending: false,
		});

		render(<ImageUploadHarness />);

		fireEvent.change(screen.getByLabelText('Logo') as HTMLInputElement, {
			target: { files: [buildFile('logo.png', 1000)] },
		});

		fireEvent.click(screen.getByRole('button', { name: 'Clear logo' }));

		expect(screen.getByTestId('logo-url-value').textContent).toBe('');
	});
});
