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
import { CreatePostActions } from './_create-post-drawer-parts';

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
