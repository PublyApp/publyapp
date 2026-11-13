/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first
import { CreatePostActions, HandoffPanel } from './_create-post-drawer-parts';

afterEach(cleanup);

describe('CreatePostActions', () => {
	test('Cancel always works, even while a save or publish is in flight (#2179)', () => {
		render(<CreatePostActions isSubmitting onCancel={vi.fn()} />);

		expect(
			(screen.getByText('common:cancel') as HTMLButtonElement).disabled,
		).toBe(false);
		expect(
			(screen.getByTestId('tenant-posts-create-save') as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});

describe('HandoffPanel', () => {
	test('the retry button says images are being sent, not that the post is saving (#2408)', () => {
		const props = { cause: '', onRetry: vi.fn(), onDiscard: vi.fn() };
		const { rerender } = render(<HandoffPanel {...props} busy={false} />);
		expect(
			screen.getByTestId('tenant-posts-create-image-retry').textContent,
		).toBe('posts:image-retry');

		rerender(<HandoffPanel {...props} busy />);
		expect(
			screen.getByTestId('tenant-posts-create-image-retry').textContent,
		).toBe('posts:image-retrying');
	});
});
