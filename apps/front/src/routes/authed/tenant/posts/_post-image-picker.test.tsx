/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	attachMutateAsync: vi.fn(),
	removeMutateAsync: vi.fn(),
}));

vi.mock('~/lib/query/tenant-post-images', () => ({
	useAttachPostImageMutation: () => ({
		mutateAsync: mocks.attachMutateAsync,
		isPending: false,
	}),
	useRemovePostImageMutation: () => ({
		mutateAsync: mocks.removeMutateAsync,
		isPending: false,
	}),
}));

const EN_LABELS: Record<string, string> = {
	'posts:image-label': 'Image',
	'posts:image-help': 'PNG, JPEG, WebP or GIF up to 2 MB.',
	'posts:image-alt-label': 'Alt text',
	'posts:image-alt-placeholder': 'Describe the image',
	'posts:image-remove': 'Remove image',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { PostImagePicker } from './_post-image-picker';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const pngFile = () =>
	new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', {
		type: 'image/png',
	});

describe('PostImagePicker', () => {
	test('renders input, alt field and help text', () => {
		render(
			<PostImagePicker
				postId="post-1"
				existingImage={null}
				onRemoved={undefined}
			/>,
		);

		expect(screen.getByTestId('tenant-posts-create-image-input')).toBeTruthy();
		expect(screen.getByTestId('tenant-posts-create-image-alt')).toBeTruthy();
		expect(screen.getByText('PNG, JPEG, WebP or GIF up to 2 MB.')).toBeTruthy();
	});

	test('attaches a picked file and shows a local preview', async () => {
		const user = userEvent.setup();
		render(
			<PostImagePicker
				postId="post-1"
				existingImage={null}
				onRemoved={undefined}
			/>,
		);

		const input = screen.getByTestId(
			'tenant-posts-create-image-input',
		) as HTMLInputElement;
		await user.upload(input, pngFile());

		await waitFor(() => {
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1);
		});
		const call = mocks.attachMutateAsync.mock.calls[0][0] as {
			postId: string;
			file: File;
			altText?: string;
		};
		expect(call.postId).toBe('post-1');
		expect(call.file.name).toBe('logo.png');
		expect(call.altText).toBeUndefined();

		expect(
			screen.getByTestId('tenant-posts-create-image-preview'),
		).toBeTruthy();
	});

	test('forwards the alt text typed before attach', async () => {
		const user = userEvent.setup();
		render(
			<PostImagePicker
				postId="post-1"
				existingImage={null}
				onRemoved={undefined}
			/>,
		);

		await user.type(
			screen.getByTestId('tenant-posts-create-image-alt'),
			'a tiny logo',
		);
		const input = screen.getByTestId(
			'tenant-posts-create-image-input',
		) as HTMLInputElement;
		await user.upload(input, pngFile());

		await waitFor(() => {
			const call = mocks.attachMutateAsync.mock.calls[0]?.[0] as
				| { altText?: string }
				| undefined;
			expect(call?.altText).toBe('a tiny logo');
		});
	});

	test('remove button deletes the image and reports removal', async () => {
		const onRemoved = vi.fn();
		const user = userEvent.setup();
		render(
			<PostImagePicker
				postId="post-1"
				existingImage={{
					url: 'https://api.example.test/files/x.png',
					widthPx: 32,
					heightPx: 32,
					altText: null,
				}}
				onRemoved={onRemoved}
			/>,
		);

		expect(
			screen.getByTestId('tenant-posts-create-image-preview'),
		).toBeTruthy();
		await user.click(screen.getByTestId('tenant-posts-create-image-remove'));

		await waitFor(() => {
			expect(mocks.removeMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
			});
			expect(onRemoved).toHaveBeenCalled();
		});
	});

	test('shows the server failure cause inline instead of a generic message', async () => {
		const user = userEvent.setup();
		mocks.attachMutateAsync.mockRejectedValueOnce({
			status: 413,
			body: {
				status: 413,
				title: 'Image too large',
				detail: 'The image exceeds the 2 MB limit.',
				translationKey: 'post-image-too-large',
			},
		});

		render(
			<PostImagePicker
				postId="post-1"
				existingImage={null}
				onRemoved={undefined}
			/>,
		);

		const input = screen.getByTestId(
			'tenant-posts-create-image-input',
		) as HTMLInputElement;
		await user.upload(input, pngFile());

		await waitFor(() => {
			const alert = screen.getByRole('alert');
			expect(alert.textContent).toContain('The image exceeds the 2 MB limit.');
		});
	});
});
