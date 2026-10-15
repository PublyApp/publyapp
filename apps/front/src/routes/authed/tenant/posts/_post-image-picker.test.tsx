/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	attachMutateAsync: vi.fn(),
	removeMutateAsync: vi.fn(),
	reorderMutateAsync: vi.fn(),
	altMutateAsync: vi.fn(),
	invalidateFn: vi.fn(),
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
	useReorderPostImagesMutation: () => ({
		mutateAsync: mocks.reorderMutateAsync,
		isPending: false,
	}),
	useUpdatePostImageAltMutation: () => ({
		mutateAsync: mocks.altMutateAsync,
		isPending: false,
	}),
	useInvalidatePostImageCaches: () => mocks.invalidateFn,
}));

const EN_LABELS: TestLabelMap = {
	'posts:images-label': 'Images',
	'posts:image-add': 'Add images',
	'posts:image-help': 'PNG, JPEG or WebP. Up to 4 images.',
	'posts:image-limit-reached': 'You can attach up to 4 images.',
	'posts:image-alt-nudge': 'Add alt text so everyone can follow your post.',
	'posts:image-alt-placeholder': 'Describe the image',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: { index?: number }) =>
			(EN_LABELS[key] ?? key) +
			(options?.index === undefined ? '' : ` ${options.index}`),
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

import type { TenantPostImage } from '~/lib/query/tenant-post-images';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import type { DeferredImageSelection } from './_post-image-picker';
import { PostImagePicker } from './_post-image-picker';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const pngFile = (name = 'logo.png') =>
	new File([new Uint8Array([137, 80, 78, 71])], name, {
		type: 'image/png',
	});

const image = (id: string, altText: string | null = null): TenantPostImage => ({
	id,
	url: `https://api.example.test/files/${id}.png`,
	widthPx: 32,
	heightPx: 32,
	altText,
});

const THREE = [image('a', 'alpha'), image('b'), image('c', 'gamma')];

describe('PostImagePicker (online mode)', () => {
	test('renders the input with the help text and no cards for an empty post', () => {
		render(<PostImagePicker postId="post-1" tenantId="tenant-1" />);

		expect(screen.getByTestId('tenant-posts-create-image-input')).toBeTruthy();
		expect(screen.getByText('PNG, JPEG or WebP. Up to 4 images.')).toBeTruthy();
		expect(screen.queryAllByTestId('tenant-posts-create-image-card')).toEqual(
			[],
		);
	});

	test('attaches picked files one by one, in order, then refreshes the caches', async () => {
		const user = userEvent.setup();
		render(<PostImagePicker postId="post-1" tenantId="tenant-1" />);

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			pngFile('one.png'),
			pngFile('two.png'),
		]);

		await waitFor(() => {
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(2);
		});
		const names = mocks.attachMutateAsync.mock.calls.map(
			(call) => (call[0] as { file: File }).file.name,
		);
		expect(names).toEqual(['one.png', 'two.png']);
		const first = mocks.attachMutateAsync.mock.calls[0][0] as {
			postId: string;
			tenantId: string;
		};
		expect(first.postId).toBe('post-1');
		// Regression (#1444 r2): the tenant-scoped factory threw before any
		// request was sent when the scope was missing.
		expect(first.tenantId).toBe('tenant-1');
		await waitFor(() => expect(mocks.invalidateFn).toHaveBeenCalled());
	});

	test('renders one card per image with its server preview and alt text', () => {
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={THREE}
			/>,
		);

		expect(
			screen.getAllByTestId('tenant-posts-create-image-card'),
		).toHaveLength(3);
		const alts = screen.getAllByTestId(
			'tenant-posts-create-image-alt',
		) as HTMLInputElement[];
		expect(alts.map((input) => input.value)).toEqual(['alpha', '', 'gamma']);
	});

	test('nudges for alt text on an image without any, but never blocks', () => {
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={THREE}
			/>,
		);

		expect(
			screen.getAllByTestId('tenant-posts-create-image-alt-nudge'),
		).toHaveLength(1);
		expect(
			(
				screen.getByTestId(
					'tenant-posts-create-image-input',
				) as HTMLInputElement
			).disabled,
		).toBe(false);
	});

	test('commits an alt text edit for that image on blur', async () => {
		const user = userEvent.setup();
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={THREE}
			/>,
		);

		const alts = screen.getAllByTestId('tenant-posts-create-image-alt');
		await user.click(alts[1]);
		fireEvent.change(alts[1], { target: { value: 'a tiny logo' } });
		await user.tab();

		await waitFor(() => {
			expect(mocks.altMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
				tenantId: 'tenant-1',
				assetId: 'b',
				altText: 'a tiny logo',
			});
		});
		expect(mocks.altMutateAsync).toHaveBeenCalledTimes(1);
	});

	test('does not call the API when the alt text did not change', async () => {
		const user = userEvent.setup();
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={THREE}
			/>,
		);

		const alts = screen.getAllByTestId('tenant-posts-create-image-alt');
		await user.click(alts[0]);
		await user.tab();

		expect(mocks.altMutateAsync).not.toHaveBeenCalled();
	});

	test('clearing an alt text sends the empty value', async () => {
		const user = userEvent.setup();
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={THREE}
			/>,
		);

		const alts = screen.getAllByTestId('tenant-posts-create-image-alt');
		await user.click(alts[0]);
		fireEvent.change(alts[0], { target: { value: '' } });
		await user.tab();

		await waitFor(() => {
			expect(mocks.altMutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({ assetId: 'a', altText: '' }),
			);
		});
	});

	test('moving an image later sends the full id list in the new order', async () => {
		const user = userEvent.setup();
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={THREE}
			/>,
		);

		const later = screen.getAllByTestId('tenant-posts-create-image-move-later');
		await user.click(later[0]);

		await waitFor(() => {
			expect(mocks.reorderMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
				tenantId: 'tenant-1',
				assetIds: ['b', 'a', 'c'],
			});
		});
	});

	test('the first image cannot move earlier and the last cannot move later', () => {
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={THREE}
			/>,
		);

		const earlier = screen.getAllByTestId(
			'tenant-posts-create-image-move-earlier',
		) as HTMLButtonElement[];
		const later = screen.getAllByTestId(
			'tenant-posts-create-image-move-later',
		) as HTMLButtonElement[];
		expect(earlier[0].disabled).toBe(true);
		expect(later[2].disabled).toBe(true);
		expect(earlier[1].disabled).toBe(false);
	});

	test('remove deletes that image by id and refreshes caches', async () => {
		const user = userEvent.setup();
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={THREE}
			/>,
		);

		await user.click(
			screen.getAllByTestId('tenant-posts-create-image-remove')[1],
		);

		await waitFor(() => {
			expect(mocks.removeMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
				tenantId: 'tenant-1',
				assetId: 'b',
			});
			expect(mocks.invalidateFn).toHaveBeenCalled();
		});
	});

	test('with four images the fifth is blocked: input disabled and the limit named', () => {
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={[...THREE, image('d')]}
			/>,
		);

		expect(
			(
				screen.getByTestId(
					'tenant-posts-create-image-input',
				) as HTMLInputElement
			).disabled,
		).toBe(true);
		expect(
			screen.getByTestId('tenant-posts-create-image-limit').textContent,
		).toBe('You can attach up to 4 images.');
	});

	test('picking more files than room left attaches only what fits and says so', async () => {
		const user = userEvent.setup();
		render(
			<PostImagePicker
				postId="post-1"
				tenantId="tenant-1"
				existingImages={THREE}
			/>,
		);

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			pngFile('one.png'),
			pngFile('two.png'),
		]);

		await waitFor(() => {
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByTestId('tenant-posts-create-image-limit')).toBeTruthy();
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

		render(<PostImagePicker postId="post-1" tenantId="tenant-1" />);

		await user.upload(
			screen.getByTestId('tenant-posts-create-image-input'),
			pngFile(),
		);

		await waitFor(() => {
			const alert = screen.getByRole('alert');
			expect(alert.textContent).toContain('The image exceeds the 2 MB limit.');
		});
	});

	test('a failed attach stops the remaining files and still refreshes the caches', async () => {
		const user = userEvent.setup();
		mocks.attachMutateAsync.mockRejectedValueOnce({
			status: 422,
			body: {
				status: 422,
				detail: 'Nope',
				translationKey: 'post-image-limit-reached',
			},
		});
		render(<PostImagePicker postId="post-1" tenantId="tenant-1" />);

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			pngFile('one.png'),
			pngFile('two.png'),
		]);

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1);
		expect(mocks.invalidateFn).toHaveBeenCalled();
	});
});

describe('PostImagePicker (deferred create-drawer mode)', () => {
	const Harness = ({
		onChange,
		initial = [],
	}: {
		onChange: (next: DeferredImageSelection[]) => void;
		initial?: DeferredImageSelection[];
	}) => {
		// The parent OWNS the selections; the picker only reports through
		// onSelect.
		const [selections, setSelections] =
			useState<DeferredImageSelection[]>(initial);
		return createElement(PostImagePicker, {
			selections,
			onSelect: (next: DeferredImageSelection[]) => {
				onChange(next);
				setSelections(next);
			},
		});
	};

	const pickedNames = (next: DeferredImageSelection[]) =>
		next.map((selection) => selection.file.name);

	test('reports every picked file in order and previews each from the parent-owned list', async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(createElement(Harness, { onChange }));

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			pngFile('one.png'),
			pngFile('two.png'),
		]);

		await waitFor(() => {
			const latest = onChange.mock.calls.at(-1)?.[0] as
				| DeferredImageSelection[]
				| undefined;
			expect(pickedNames(latest ?? [])).toEqual(['one.png', 'two.png']);
		});
		expect(
			screen.getAllByTestId('tenant-posts-create-image-preview'),
		).toHaveLength(2);
		expect(mocks.attachMutateAsync).not.toHaveBeenCalled();
	});

	test('keeps each alt text with its own file and removes one card', async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(createElement(Harness, { onChange }));

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			pngFile('one.png'),
			pngFile('two.png'),
		]);
		const alts = await screen.findAllByTestId('tenant-posts-create-image-alt');
		fireEvent.change(alts[1], { target: { value: 'second alt' } });

		await waitFor(() => {
			const latest = onChange.mock.calls.at(
				-1,
			)?.[0] as DeferredImageSelection[];
			expect(latest.map((selection) => selection.altText)).toEqual([
				'',
				'second alt',
			]);
		});

		await user.click(
			screen.getAllByTestId('tenant-posts-create-image-remove')[0],
		);
		await waitFor(() => {
			const latest = onChange.mock.calls.at(
				-1,
			)?.[0] as DeferredImageSelection[];
			expect(pickedNames(latest)).toEqual(['two.png']);
			expect(latest[0].altText).toBe('second alt');
		});
		expect(
			screen.getAllByTestId('tenant-posts-create-image-card'),
		).toHaveLength(1);
	});

	test('reorders locally without any API call', async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(createElement(Harness, { onChange }));

		await user.upload(screen.getByTestId('tenant-posts-create-image-input'), [
			pngFile('one.png'),
			pngFile('two.png'),
		]);
		await screen.findAllByTestId('tenant-posts-create-image-card');
		await user.click(
			screen.getAllByTestId('tenant-posts-create-image-move-later')[0],
		);

		await waitFor(() => {
			const latest = onChange.mock.calls.at(
				-1,
			)?.[0] as DeferredImageSelection[];
			expect(pickedNames(latest)).toEqual(['two.png', 'one.png']);
		});
		expect(mocks.reorderMutateAsync).not.toHaveBeenCalled();
	});

	test('blocks a fifth file: only four are kept and the limit is named', async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(createElement(Harness, { onChange }));

		await user.upload(
			screen.getByTestId('tenant-posts-create-image-input'),
			['1', '2', '3', '4', '5'].map((n) => pngFile(`${n}.png`)),
		);

		await waitFor(() => {
			const latest = onChange.mock.calls.at(
				-1,
			)?.[0] as DeferredImageSelection[];
			expect(pickedNames(latest)).toEqual(['1.png', '2.png', '3.png', '4.png']);
		});
		expect(screen.getByTestId('tenant-posts-create-image-limit')).toBeTruthy();
		expect(
			(
				screen.getByTestId(
					'tenant-posts-create-image-input',
				) as HTMLInputElement
			).disabled,
		).toBe(true);
	});
});
