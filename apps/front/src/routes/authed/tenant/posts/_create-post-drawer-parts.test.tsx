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
	test('Cancel is disabled while the images are attaching (#2179)', () => {
		render(<CreatePostActions isSubmitting={false} busy onCancel={vi.fn()} />);

		expect(
			(screen.getByText('common:cancel') as HTMLButtonElement).disabled,
		).toBe(true);
	});

	test('Cancel works when nothing is attaching', () => {
		render(<CreatePostActions isSubmitting={false} onCancel={vi.fn()} />);

		expect(
			(screen.getByText('common:cancel') as HTMLButtonElement).disabled,
		).toBe(false);
	});
});
