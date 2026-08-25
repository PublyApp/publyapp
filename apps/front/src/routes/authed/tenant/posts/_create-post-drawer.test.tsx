/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	attachMutateAsync: vi.fn(),
	removeMutateAsync: vi.fn(),
	altMutateAsync: vi.fn(),
	invalidatePostImageCaches: vi.fn(),
	savePost: vi.fn(),
	invalidateTenantPosts: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
	useTenantProjectsQuery: () => ({ data: undefined, isPending: true }),
	toTenantProjectItems: () => [],
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

vi.mock('~/components/field', () => ({
	// Mirrors the real FieldTextarea: reads the form context and wires a
	// Controller, so React Hook Form actually sees the typed value. The
	// component body lives in MockedFieldTextarea below, where the real
	// react-hook-form import is in scope (this factory runs before that);
	// the indirection is evaluated at render time, not factory time.
	Field: {
		Textarea: (props: {
			name: string;
			label?: string;
			placeholder?: string;
			rows?: number;
			testIdProp?: string;
		}) => MockedFieldTextarea(props),
		Select: ({ name }: { name?: string }) => createElement('select', { name }),
	},
}));

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

vi.mock('~/components/ui/drawer', () => ({
	Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
		open
			? createElement('div', { 'data-testid': 'drawer-root' }, children)
			: null,
	DrawerContent: ({ children, ...props }: { children: ReactNode }) =>
		createElement('div', props, children),
	DrawerHeader: ({ children }: { children: ReactNode }) =>
		createElement('div', null, children),
	DrawerTitle: ({ children }: { children: ReactNode }) =>
		createElement('h2', null, children),
	DrawerBody: ({ children }: { children: ReactNode }) =>
		createElement('div', null, children),
	DrawerFooter: ({ children }: { children: ReactNode }) =>
		createElement('div', null, children),
	// Same shape as the real DrawerForm: spreads the UseFormReturn into a
	// FormProvider so `useFormContext()` consumers inside see the form.
	DrawerForm: ({
		children,
		methods,
		onSubmit,
	}: {
		children: ReactNode;
		methods: UseFormReturn;
		onSubmit: (event?: unknown) => void | Promise<void>;
	}) =>
		createElement(
			FormProvider,
			// The real DrawerForm spreads every UseFormReturn member into
			// FormProvider props; createElement keeps that spread out of JSX.
			{
				...methods,
				children: createElement(
					'form',
					{
						onSubmit: (event: Event) => {
							event.preventDefault();
							void onSubmit(event);
						},
					},
					children,
				),
			},
		),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { CreatePostDrawer } from './_create-post-drawer';

type MockedFieldProps = {
	name: string;
	label?: string;
	placeholder?: string;
	rows?: number;
};

/** Test double of FieldTextarea wired through Controller + form context. */
const MockedFieldTextarea = ({
	name,
	label,
	placeholder,
	rows,
	...rest
}: MockedFieldProps & Record<string, unknown>) => {
	const { control } = useFormContext();
	return createElement(Controller, {
		name,
		control,
		render: ({
			field,
		}: {
			field: {
				value: string;
				onChange: (value: string) => void;
				onBlur: () => void;
			};
		}) =>
			createElement('textarea', {
				...field,
				...rest,
				name,
				placeholder,
				rows,
				'aria-label': label,
				onChange: (event: { target: { value: string } }) =>
					field.onChange(event.target.value),
			}),
	});
};

const PNG_FILE = new File(
	[new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
	'logo.png',
	{ type: 'image/png' },
);

beforeEach(() => {
	mocks.savePost.mockResolvedValue({ id: 'post-1' });
	mocks.attachMutateAsync.mockResolvedValue(undefined);
	mocks.altMutateAsync.mockResolvedValue(undefined);
	mocks.invalidateTenantPosts.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('CreatePostDrawer deferred image handoff', () => {
	test('attaches the picked image after creation and forwards its alt text through the PATCH', async () => {
		const onOpenChange = vi.fn();
		render(
			<CreatePostDrawer
				open={true}
				onOpenChange={onOpenChange}
				tenantId="tenant-1"
			/>,
		);

		await userEvent.type(
			screen.getByTestId('tenant-posts-create-body'),
			'draft body',
		);
		await userEvent.upload(
			screen.getByTestId('tenant-posts-create-image-input'),
			PNG_FILE,
		);
		await userEvent.type(
			screen.getByTestId('tenant-posts-create-image-alt'),
			'A tiny red square',
		);
		await userEvent.click(screen.getByTestId('tenant-posts-create-save'));

		await waitFor(() => expect(mocks.savePost).toHaveBeenCalledTimes(1));
		expect(mocks.savePost).toHaveBeenCalledWith(
			expect.objectContaining({ body: 'draft body', tenantId: 'tenant-1' }),
		);

		await waitFor(() =>
			expect(mocks.attachMutateAsync).toHaveBeenCalledTimes(1),
		);
		const attachArg = mocks.attachMutateAsync.mock.calls[0][0] as {
			postId: string;
			file: File;
		};
		expect(attachArg.postId).toBe('post-1');
		expect(attachArg.file).toBeInstanceOf(File);

		// Regression: the deferred alt text used to be dropped silently.
		await waitFor(() =>
			expect(mocks.altMutateAsync).toHaveBeenCalledWith({
				postId: 'post-1',
				altText: 'A tiny red square',
			}),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test('skips both image mutations when no image was selected', async () => {
		render(
			<CreatePostDrawer
				open={true}
				onOpenChange={vi.fn()}
				tenantId="tenant-1"
			/>,
		);

		await userEvent.type(
			screen.getByTestId('tenant-posts-create-body'),
			'text only',
		);
		await userEvent.click(screen.getByTestId('tenant-posts-create-save'));

		await waitFor(() => expect(mocks.savePost).toHaveBeenCalledTimes(1));
		expect(mocks.attachMutateAsync).not.toHaveBeenCalled();
		expect(mocks.altMutateAsync).not.toHaveBeenCalled();
	});
});
