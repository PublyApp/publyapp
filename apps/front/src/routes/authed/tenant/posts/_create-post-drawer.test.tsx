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
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	/** The props the publish block was last rendered with. */
	publishBlockProps: {
		current: undefined as
			| {
					imageKeys?: string[];
					onBeforePublish?: () => Promise<{
						postId: string;
						assetIdByKey?: ReadonlyMap<string, string>;
					} | null>;
			  }
			| undefined,
	},
	attachMutateAsync: vi.fn(),
	removeMutateAsync: vi.fn(),
	reorderMutateAsync: vi.fn(),
	altMutateAsync: vi.fn(),
	invalidatePostImageCaches: vi.fn(),
	savePost: vi.fn(),
	invalidateTenantPosts: vi.fn(),
}));

/** Shared react-hook-form state so tests can reset between renders. */
const rhf = vi.hoisted(() => {
	type FieldEntry = {
		value: string;
	};
	const fields = new Map<string, FieldEntry>();
	const errors: Record<string, { message?: string }> = {};
	const get = (name: string): FieldEntry => {
		let entry = fields.get(name);
		if (!entry) {
			entry = { value: '' };
			fields.set(name, entry);
		}
		return entry;
	};
	return {
		fields,
		errors,
		get,
		resetAll: () => {
			fields.clear();
			for (const key of Object.keys(errors)) {
				delete errors[key];
			}
		},
		snapshot: () =>
			Object.fromEntries(
				[...fields.entries()].map(([name, entry]) => [name, entry.value]),
			),
	};
});

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// D2's "Publish on" block joined the drawer footer in the merge with develop.
// These tests cover the deferred image handoff, not publishing, so a static
// stub keeps the suite focused (same pattern as the edit page's suite).
vi.mock('./_publish-on-block', () => ({
	PublishOnBlock: (props: {
		body?: string;
		imageKeys?: string[];
		onBeforePublish?: () => Promise<{
			postId: string;
			assetIdByKey?: ReadonlyMap<string, string>;
		} | null>;
	}) => {
		mocks.publishBlockProps.current = props;
		return (
			<span data-testid="stub-publish-on-body-length">
				{props.body?.length ?? 0}
			</span>
		);
	},
}));

// The destination chips and tab pull their own queries; the deferred image
// handoff is what this suite covers.
vi.mock('./_composer-destinations', () => ({
	ComposerDestinations: () => <div data-testid="stub-composer-destinations" />,
}));

vi.mock('./_use-publish-selection', () => ({
	usePublishSelection: () => ({
		targets: [],
		selectedIds: [],
		toggle: () => undefined,
		destinations: [],
		imageLimits: null,
	}),
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
	useInvalidatePostImageCaches: () => mocks.invalidatePostImageCaches,
}));

vi.mock('~/lib/query/tenant-posts', () => ({
	savePost: mocks.savePost,
	invalidateTenantPosts: mocks.invalidateTenantPosts,
}));

vi.mock('~/lib/query/tenant-projects', () => ({
	useTenantProjectsQuery: () => ({ data: undefined }),
	toTenantProjectItems: () => [],
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// A tiny react-hook-form double: enough surface (useForm/useController/
// useWatch/useFormState) for the drawer and the field components to run for
// real against a plain object store, without shipping RHF internals here.
vi.mock('react-hook-form', () => {
	const useController = ({ name }: { name: string }) => {
		const entry = rhf.get(name);
		return {
			field: {
				name,
				value: entry.value,
				ref: null,
				onBlur: () => {},
				onChange: (event: { target: { value: string } }) => {
					entry.value = event.target.value;
				},
			},
			fieldState: {},
		};
	};
	return {
		useForm: () => ({
			register: (name: string) => {
				const entry = rhf.get(name);
				return {
					name,
					ref: null,
					onBlur: () => {},
					onChange: (event: { target: { value: string } }) => {
						entry.value = event.target.value;
					},
				};
			},
			getValues: () => ({ ...rhf.snapshot(), segments: [] }),
			trigger: async () => true,
			handleSubmit:
				(onValid: (values: Record<string, unknown>) => void | Promise<void>) =>
				(event?: Event) => {
					event?.preventDefault();
					void onValid({ ...rhf.snapshot(), segments: [] });
				},
			formState: { errors: rhf.errors, isSubmitting: false, isValid: true },
			// D2's "Publish on" block receives the selected project through
			// useForm().watch, so the double must expose it even though this
			// suite stubs the block component itself.
			watch: (name: string) => rhf.get(name).value,
			setError: (name: string, error: { message?: string }) => {
				rhf.errors[name] = error;
			},
			// Like the real `reset(values)`: the given values become the form state.
			reset: (values?: { body?: string }) => {
				rhf.resetAll();
				if (values?.body !== undefined) {
					rhf.get('body').value = values.body;
				}
			},
			control: undefined,
		}),
		useController,
		useWatch: ({ name }: { name: string }) => rhf.get(name).value,
		useFormState: () => ({ isSubmitting: false }),
	};
});

vi.mock('~/components/field', async () => {
	const { createElement } = await import('react');
	const { useController } = await import('react-hook-form');
	type TextareaProps = {
		name: string;
		label?: string;
		placeholder?: string;
		rows?: number;
		ariaDescribedBy?: string;
		testIdProp?: string;
	};
	return {
		Field: {
			Textarea: ({
				name,
				label,
				placeholder,
				rows,
				...rest
			}: TextareaProps & Record<string, unknown>) => {
				const { field } = useController({ name });
				// Uncontrolled on purpose: this double has no provider/rerender
				// machinery, and React resets controlled inputs whose value prop
				// never moves. The DOM owns the text; onChange mirrors it into
				// the fake form store that handleSubmit snapshots.
				return createElement('textarea', {
					...rest,
					name,
					placeholder,
					rows,
					defaultValue: '',
					'aria-label': label,
					onChange: (event: { target: { value: string } }) =>
						field.onChange(event),
				});
			},
			Select: ({ name }: { name: string }) => createElement('select', { name }),
		},
	};
});

vi.mock('~/components/ui/button', async () => {
	const { createElement } = await import('react');
	return {
		Button: ({
			children,
			onClick,
			disabled,
			type,
			...props
		}: {
			children?: ReactNode;
			onClick?: () => void;
			disabled?: boolean;
			type?: string;
		}) =>
			createElement(
				'button',
				{ type: type ?? 'button', onClick, disabled, ...props },
				children,
			),
	};
});

vi.mock('~/components/ui/drawer', async () => {
	const { createElement } = await import('react');
	return {
		Drawer: ({ open, children }: { open: boolean; children?: ReactNode }) =>
			open
				? createElement('div', { 'data-testid': 'drawer-root' }, children)
				: null,
		DrawerContent: ({ children, ...props }: { children?: ReactNode }) =>
			createElement('div', props, children),
		DrawerHeader: ({ children }: { children?: ReactNode }) =>
			createElement('div', null, children),
		DrawerTitle: ({ children }: { children?: ReactNode }) =>
			createElement('h2', null, children),
		DrawerBody: ({ children }: { children?: ReactNode }) =>
			createElement('div', null, children),
		DrawerFooter: ({ children }: { children?: ReactNode }) =>
			createElement('div', null, children),
		// Same shape as the real DrawerForm: wraps the form context provider and
		// forwards submit. The form element reaches createElement as its third
		// argument — never as an explicit `children:` prop key.
		DrawerForm: ({
			children,
			onSubmit,
		}: {
			children?: ReactNode;
			onSubmit: (event?: unknown) => void | Promise<void>;
		}) =>
			createElement(
				'form',
				{
					onSubmit: (event: Event) => {
						event.preventDefault();
						void onSubmit(event);
					},
				},
				children,
			),
	};
});

import { CreatePostDrawer } from './_create-post-drawer';

const PNG_FILE = new File(
	[new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
	'logo.png',
	{ type: 'image/png' },
);

const SECOND_FILE = new File(
	[new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
	'second.png',
	{
		type: 'image/png',
	},
);

const UNSUPPORTED_TYPE_PROBLEM = {
	status: 422,
	body: {
		status: 422,
		title: 'Unsupported image type',
		detail: 'This file is not a supported image.',
		translationKey: 'post-image-unsupported-type',
	},
};

const TOO_LARGE_PROBLEM = {
	status: 413,
	body: {
		status: 413,
		title: 'Image too large',
		detail: 'The image exceeds the 2 MB limit.',
		translationKey: 'post-image-too-large',
	},
};

const renderDrawer = (onOpenChange: (open: boolean) => void) =>
	render(
		<CreatePostDrawer
			open={true}
			onOpenChange={onOpenChange}
			tenantId="tenant-1"
		/>,
	);

/** Sets a field's value with a single change event (like a paste): typing
 * char-by-char into the controlled alt input races the parent's state round
 * trip under jsdom and drops characters. */
const setFieldValue = (testId: string, value: string) => {
	fireEvent.change(screen.getByTestId(testId), { target: { value } });
};

const fillBodyAndPickImage = async (body: string) => {
	setFieldValue('tenant-posts-create-body', body);
	await userEvent.upload(
		screen.getByTestId('tenant-posts-create-image-input'),
		PNG_FILE,
	);
	setFieldValue('tenant-posts-create-image-alt', 'A tiny red square');
};

beforeEach(() => {
	rhf.resetAll();
	mocks.savePost.mockResolvedValue({ id: 'post-1' });
	mocks.attachMutateAsync.mockResolvedValue({ id: 'asset-1' });
	mocks.altMutateAsync.mockResolvedValue(undefined);
	mocks.invalidateTenantPosts.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('CreatePostDrawer provider limit counter (#2169)', () => {
	test('feeds the live body to the publish block and keeps Save draft enabled over a provider limit', async () => {
		// The RHF double is not reactive, so the over-limit body is seeded first.
		rhf.get('body').value = 'a'.repeat(400);
		renderDrawer(vi.fn());

		expect(screen.getByTestId('stub-publish-on-body-length').textContent).toBe(
			'400',
		);
		expect(
			(screen.getByTestId('tenant-posts-create-save') as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});
});

describe('CreatePostDrawer publish preparation (#2172)', () => {
	test('saves the draft, uploads the picked images, and hands back the asset id of each picked image by its local key', async () => {
		renderDrawer(vi.fn());
		await fillBodyAndPickImage('publish body');
		const props = mocks.publishBlockProps.current;
		// Before the post exists an image is named by its local id.
		const [localKey] = props?.imageKeys ?? [];
		expect(localKey).toBeTruthy();

		const prepared = await props?.onBeforePublish?.();

		expect(mocks.savePost).toHaveBeenCalledWith(
			expect.objectContaining({ body: 'publish body', tenantId: 'tenant-1' }),
		);
		expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1);
		expect(prepared).toEqual({
			postId: 'post-1',
			assetIdByKey: new Map([[localKey as string, 'asset-1']]),
		});
	});

	test('a publish that failed is retried on the SAME post, with the same asset ids and no second upload', async () => {
		mocks.savePost.mockResolvedValue({ id: 'post-1', body: 'publish body' });
		renderDrawer(vi.fn());
		await fillBodyAndPickImage('publish body');
		const [localKey] = mocks.publishBlockProps.current?.imageKeys ?? [];
		const first = await mocks.publishBlockProps.current?.onBeforePublish?.();
		expect(first?.postId).toBe('post-1');

		// The publish request failed: the drawer is still open and the picked
		// image is still in the picker, so a customization can still name it.
		await waitFor(() =>
			expect(mocks.publishBlockProps.current?.imageKeys).toEqual([localKey]),
		);
		const second = await mocks.publishBlockProps.current?.onBeforePublish?.();

		expect(mocks.savePost).toHaveBeenCalledTimes(2);
		expect(mocks.savePost.mock.calls[0]?.[0].postId).toBeUndefined();
		expect(mocks.savePost.mock.calls[1]?.[0].postId).toBe('post-1');
		// Uploaded once, and the key to asset id mapping survives the retry.
		expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1);
		expect(second).toEqual({
			postId: 'post-1',
			assetIdByKey: new Map([[localKey as string, 'asset-1']]),
		});
	});

	test('changing the picked images after the post was created starts a fresh post', async () => {
		mocks.savePost.mockResolvedValue({ id: 'post-1', body: 'publish body' });
		renderDrawer(vi.fn());
		await fillBodyAndPickImage('publish body');
		await mocks.publishBlockProps.current?.onBeforePublish?.();

		await userEvent.upload(
			screen.getByTestId('tenant-posts-create-image-input'),
			SECOND_FILE,
		);
		await waitFor(() =>
			expect(mocks.publishBlockProps.current?.imageKeys).toHaveLength(2),
		);
		await mocks.publishBlockProps.current?.onBeforePublish?.();

		expect(mocks.savePost.mock.calls[1]?.[0].postId).toBeUndefined();
		// Both images are uploaded again onto the new post.
		expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(3);
	});

	test('aborts the publish (null) when an image cannot be attached, leaving the handoff to retry', async () => {
		mocks.attachMutateAsync.mockRejectedValueOnce(UNSUPPORTED_TYPE_PROBLEM);
		renderDrawer(vi.fn());
		await fillBodyAndPickImage('publish body');

		const prepared = await mocks.publishBlockProps.current?.onBeforePublish?.();

		expect(prepared).toBeNull();
		await waitFor(() =>
			expect(
				screen.getByTestId('tenant-posts-create-image-handoff'),
			).toBeTruthy(),
		);
	});

	test('a text-only draft needs no upload and hands back no asset ids', async () => {
		renderDrawer(vi.fn());
		setFieldValue('tenant-posts-create-body', 'text only');

		const prepared = await mocks.publishBlockProps.current?.onBeforePublish?.();

		expect(mocks.attachMutateAsync).not.toHaveBeenCalled();
		expect(prepared).toEqual({ postId: 'post-1', assetIdByKey: new Map() });
	});
});

describe('CreatePostDrawer deferred image handoff', () => {
	test('attaches the picked image after creation and forwards its alt text through the per-image PATCH', async () => {
		const onOpenChange = vi.fn();
		renderDrawer(onOpenChange);

		await fillBodyAndPickImage('draft body');
		await userEvent.click(screen.getByTestId('tenant-posts-create-save'));

		await waitFor(() => expect(mocks.savePost).toHaveBeenCalledTimes(1));
		expect(mocks.savePost).toHaveBeenCalledWith(
			expect.objectContaining({
				body: 'draft body',
				tenantId: 'tenant-1',
			}),
		);

		await waitFor(() =>
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
		);
		const attachArg = mocks.attachMutateAsync.mock.calls[0][0] as {
			postId: string;
			tenantId: string;
			file: File;
		};
		expect(attachArg.postId).toBe('post-1');
		// Regression (#1444 round 2): the image mutations are tenant-scoped
		// factory hooks — a missing scope threw before any request was sent.
		expect(attachArg.tenantId).toBe('tenant-1');
		expect(attachArg.file).toBeInstanceOf(File);

		// Regression: the deferred alt text used to be dropped silently.
		await waitFor(() =>
			expect(mocks.altMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
				tenantId: 'tenant-1',
				assetId: 'asset-1',
				altText: 'A tiny red square',
			}),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test('skips both image mutations when no image was selected', async () => {
		renderDrawer(vi.fn());

		await setFieldValue('tenant-posts-create-body', 'text only');
		await userEvent.click(screen.getByTestId('tenant-posts-create-save'));

		await waitFor(() => expect(mocks.savePost).toHaveBeenCalledTimes(1));
		expect(mocks.attachMutateAsync).not.toHaveBeenCalled();
		expect(mocks.altMutateAsync).not.toHaveBeenCalled();
	});

	test('create succeeds but attach is rejected: drawer stays open, names the cause, post stays consistent', async () => {
		const onOpenChange = vi.fn();
		mocks.attachMutateAsync.mockRejectedValueOnce(UNSUPPORTED_TYPE_PROBLEM);
		renderDrawer(onOpenChange);

		await fillBodyAndPickImage('draft body');
		await userEvent.click(screen.getByTestId('tenant-posts-create-save'));

		// The post WAS created...
		await waitFor(() => expect(mocks.savePost).toHaveBeenCalledTimes(1));
		// ...the attach attempt happened and failed...
		await waitFor(() =>
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
		);
		// ...so the drawer must NOT close over the stranded attachment.
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
		expect(screen.getByTestId('tenant-posts-create-drawer')).toBeTruthy();

		// The cause is shown in plain words (the server's problem detail).
		const alert = screen.getByRole('alert');
		expect(alert.textContent).toContain('This file is not a supported image.');

		// The post stays consistent: the alt PATCH never runs without a
		// successful attach, so no half-attached image state exists server-side.
		expect(mocks.altMutateAsync).not.toHaveBeenCalled();

		// The drawer names the situation and offers a way forward.
		expect(
			screen.getByTestId('tenant-posts-create-image-handoff'),
		).toBeTruthy();
		expect(screen.getByTestId('tenant-posts-create-image-retry')).toBeTruthy();
		expect(
			screen.getByTestId('tenant-posts-create-image-discard'),
		).toBeTruthy();
	});

	test('retrying the failed attach attaches the image and closes the drawer', async () => {
		const onOpenChange = vi.fn();
		mocks.attachMutateAsync
			.mockRejectedValueOnce(TOO_LARGE_PROBLEM)
			.mockResolvedValueOnce({ id: 'asset-1' });
		renderDrawer(onOpenChange);

		await fillBodyAndPickImage('draft body');
		await userEvent.click(screen.getByTestId('tenant-posts-create-save'));

		await waitFor(() =>
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
		);
		const alert = screen.getByRole('alert');
		expect(alert.textContent).toContain('The image exceeds the 2 MB limit.');

		await userEvent.click(
			screen.getByTestId('tenant-posts-create-image-retry'),
		);

		await waitFor(() =>
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(2),
		);
		await waitFor(() =>
			expect(mocks.altMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
				tenantId: 'tenant-1',
				assetId: 'asset-1',
				altText: 'A tiny red square',
			}),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test('discarding the failed image keeps the created post and closes cleanly', async () => {
		const onOpenChange = vi.fn();
		mocks.attachMutateAsync.mockRejectedValueOnce(TOO_LARGE_PROBLEM);
		renderDrawer(onOpenChange);

		await fillBodyAndPickImage('draft body');
		await userEvent.click(screen.getByTestId('tenant-posts-create-save'));

		await waitFor(() =>
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
		);

		await userEvent.click(
			screen.getByTestId('tenant-posts-create-image-discard'),
		);

		// The post itself is kept (it is consistent without an image); only
		// the failed attachment is dropped and the drawer closes.
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(mocks.altMutateAsync).not.toHaveBeenCalled();
	});

	test('attaches several images in the picked order, each followed by its own alt text', async () => {
		const onOpenChange = vi.fn();
		mocks.attachMutateAsync
			.mockResolvedValueOnce({ id: 'asset-a' })
			.mockResolvedValueOnce({ id: 'asset-b' });
		renderDrawer(onOpenChange);

		setFieldValue('tenant-posts-create-body', 'two pictures');
		await userEvent.upload(
			screen.getByTestId('tenant-posts-create-image-input'),
			[PNG_FILE, SECOND_FILE],
		);
		const alts = screen.getAllByTestId('tenant-posts-create-image-alt');
		fireEvent.change(alts[0], { target: { value: 'first alt' } });
		fireEvent.change(alts[1], { target: { value: 'second alt' } });
		await userEvent.click(screen.getByTestId('tenant-posts-create-save'));

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		const attachedNames = mocks.attachMutateAsync.mock.calls.map(
			(call) => (call[0] as { file: File }).file.name,
		);
		expect(attachedNames).toEqual(['logo.png', 'second.png']);
		expect(mocks.altMutateAsync.mock.calls.map((call) => call[0])).toEqual([
			expect.objectContaining({ assetId: 'asset-a', altText: 'first alt' }),
			expect.objectContaining({ assetId: 'asset-b', altText: 'second alt' }),
		]);
	});

	test('a failure on the second image keeps it in the handoff and a retry never re-attaches the first', async () => {
		const onOpenChange = vi.fn();
		mocks.attachMutateAsync
			.mockResolvedValueOnce({ id: 'asset-a' })
			.mockRejectedValueOnce(TOO_LARGE_PROBLEM)
			.mockResolvedValueOnce({ id: 'asset-b' });
		renderDrawer(onOpenChange);

		setFieldValue('tenant-posts-create-body', 'two pictures');
		await userEvent.upload(
			screen.getByTestId('tenant-posts-create-image-input'),
			[PNG_FILE, SECOND_FILE],
		);
		await userEvent.click(screen.getByTestId('tenant-posts-create-save'));

		await waitFor(() =>
			expect(
				screen.getByTestId('tenant-posts-create-image-handoff'),
			).toBeTruthy(),
		);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);

		await userEvent.click(
			screen.getByTestId('tenant-posts-create-image-retry'),
		);
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

		const attachedNames = mocks.attachMutateAsync.mock.calls.map(
			(call) => (call[0] as { file: File }).file.name,
		);
		expect(attachedNames).toEqual(['logo.png', 'second.png', 'second.png']);
	});
});
