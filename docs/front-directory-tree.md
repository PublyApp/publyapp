# Front Directory Tree

Directory structure of `apps/front/` (excluding `node_modules`, `build`, and other generated files).

```
apps/front/
├── @types/
│   ├── env.d.ts
│   ├── mui-otp.d.ts
│   ├── react-router.d.ts
│   └── simplebar-react.d.ts
│
├── app/
│   ├── entry.client.tsx
│   ├── entry.server.tsx
│   ├── root.tsx
│   ├── routes.ts
│   │
│   ├── assets/
│   │   ├── data/
│   │   │   ├── countries.ts
│   │   │   └── index.ts
│   │   ├── icons/
│   │   └── illustrations/
│   │
│   ├── components/
│   │   ├── address/
│   │   ├── animate/
│   │   ├── auth/
│   │   ├── billing/
│   │   ├── brand-switcher/
│   │   ├── country-select/
│   │   ├── custom-breadcrumbs/
│   │   ├── custom-dialog/
│   │   ├── custom-popover/
│   │   ├── custom-tabs/
│   │   ├── editor/
│   │   ├── empty-content/
│   │   ├── error/
│   │   ├── file-thumbnail/
│   │   ├── flag-icon/
│   │   ├── hook-form/
│   │   ├── iconify/
│   │   ├── image/
│   │   ├── label/
│   │   ├── loading-screen/
│   │   ├── logo/
│   │   ├── nav-basic/
│   │   ├── nav-section/
│   │   ├── number-input/
│   │   ├── payment/
│   │   ├── phone-input/
│   │   ├── progress-bar/
│   │   ├── scrollbar/
│   │   ├── search-not-found/
│   │   ├── settings/
│   │   ├── snackbar/
│   │   ├── svg-color/
│   │   └── upload/
│   │
│   ├── hooks/
│   │   ├── use-home-path.ts
│   │   ├── use-is-mobile.ts
│   │   ├── use-match-path.ts
│   │   ├── use-mrt-table.ts
│   │   ├── use-nonce-context.ts
│   │   ├── use-pathname.ts
│   │   ├── use-router.ts
│   │   ├── use-scroll-position.ts
│   │   ├── use-scrollspy.ts
│   │   ├── use-settings-context.ts
│   │   ├── use-sync-form-to-lang.ts
│   │   ├── use-table-state.ts
│   │   ├── use-tenant-param.ts
│   │   └── use-translate.ts
│   │
│   ├── layouts/
│   │   ├── auth-split/
│   │   ├── components/
│   │   ├── core/
│   │   ├── dashboard/
│   │   ├── main/
│   │   ├── simple/
│   │   ├── nav-config-account.tsx
│   │   ├── nav-config-dashboard.tsx
│   │   ├── nav-config-main-demo.tsx
│   │   └── nav-config-main.tsx
│   │
│   ├── lib/
│   │   ├── analytics/
│   │   │   └── analytics.ts
│   │   ├── api-failure/
│   │   │   ├── index.ts
│   │   │   ├── map-validation-errors.ts
│   │   │   ├── schemas.ts
│   │   │   ├── to-api-failure.ts
│   │   │   ├── types.ts
│   │   │   └── with-form-validation.ts
│   │   ├── cookies/
│   │   │   ├── index.ts
│   │   │   ├── logout.utils.ts
│   │   │   ├── server-cookie.utils.ts
│   │   │   └── session-cookie.utils.ts
│   │   ├── i18n/
│   │   │   ├── i18n.config.ts
│   │   │   ├── i18n.server.ts
│   │   │   ├── init-i18n.client.ts
│   │   │   └── init-i18n.server.ts
│   │   ├── js-client/
│   │   │   ├── client-manager.ts
│   │   │   └── kiota-utils.ts
│   │   ├── locales/
│   │   │   ├── all-langs.ts
│   │   │   └── number-format-locale.ts
│   │   ├── mrt-table/
│   │   │   ├── table-presets.ts
│   │   │   ├── types.ts
│   │   │   └── presets/
│   │   ├── mui/
│   │   │   └── theme/
│   │   │       ├── create-classes.ts
│   │   │       ├── create-theme.ts
│   │   │       ├── extend-theme-types.d.ts
│   │   │       ├── theme-config.ts
│   │   │       ├── theme-provider.tsx
│   │   │       ├── types.ts
│   │   │       ├── core/
│   │   │       └── with-settings/
│   │   ├── react-query/
│   │   │   ├── create-hooks.ts
│   │   │   ├── query-client.tsx
│   │   │   ├── query-utils.ts
│   │   │   └── features/
│   │   │       ├── common/
│   │   │       └── staff/
│   │   ├── react-router/
│   │   │   ├── client-data.ts
│   │   │   ├── data.utils.ts
│   │   │   ├── navigation-helper.ts
│   │   │   ├── safeRun.ts
│   │   │   └── server-data.server.ts
│   │   ├── zod/
│   │   │   └── zod.client.ts
│   │   └── zustand/
│   │       ├── slices.ts
│   │       ├── store.ts
│   │       ├── features/
│   │       └── utils/
│   │
│   ├── routes/
│   │   ├── auth/
│   │   │   ├── accept-invitation/
│   │   │   │   └── accept-invitation-page.tsx
│   │   │   ├── login/
│   │   │   │   ├── login-form.tsx
│   │   │   │   └── login-page.tsx
│   │   │   ├── reset-password/
│   │   │   │   └── reset-password-page.tsx
│   │   │   ├── signup/
│   │   │   │   ├── sign-up-form.tsx
│   │   │   │   └── sign-up-page.tsx
│   │   │   ├── verify-email/
│   │   │   │   └── verify-email-page.tsx
│   │   │   ├── clear-session.tsx
│   │   │   ├── components/
│   │   │   └── _layout/
│   │   │       └── auth-layout.tsx
│   │   │
│   │   ├── authed/
│   │   │   ├── onboarding/
│   │   │   │   └── onboarding-page.tsx
│   │   │   │
│   │   │   ├── settings/
│   │   │   │   ├── notifications/
│   │   │   │   ├── profile/
│   │   │   │   └── security/
│   │   │   │
│   │   │   ├── staff/
│   │   │   │   ├── audit-logs/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── invitations/
│   │   │   │   │   ├── details/
│   │   │   │   │   ├── list/
│   │   │   │   │   └── new/
│   │   │   │   ├── profiles/
│   │   │   │   │   ├── details/
│   │   │   │   │   ├── list/
│   │   │   │   │   └── new/
│   │   │   │   ├── settings/
│   │   │   │   ├── staff-members/
│   │   │   │   │   ├── details/
│   │   │   │   │   ├── list/
│   │   │   │   │   └── new/
│   │   │   │   ├── tenants/
│   │   │   │   │   ├── details/
│   │   │   │   │   ├── list/
│   │   │   │   │   └── new/
│   │   │   │   ├── _errors/
│   │   │   │   └── _layout/
│   │   │   │
│   │   │   ├── tenant/
│   │   │   │   ├── accounts/
│   │   │   │   ├── analytics/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── drafts/
│   │   │   │   ├── media/
│   │   │   │   ├── posts/
│   │   │   │   ├── schedule/
│   │   │   │   ├── settings/
│   │   │   │   ├── _errors/
│   │   │   │   ├── _layout/
│   │   │   │   └── _portal/
│   │   │   │
│   │   │   └── _layout/
│   │   │       └── authed-layout.tsx
│   │   │
│   │   ├── maintenance/
│   │   │   └── maintenance-page.tsx
│   │   │
│   │   ├── marketing/
│   │   │   ├── home/
│   │   │   │   ├── home-page.tsx
│   │   │   │   ├── components/
│   │   │   │   └── parts/
│   │   │   │       └── home-hero.tsx
│   │   │   └── _layout/
│   │   │       └── marketing-layout.tsx
│   │   │
│   │   └── unauthorized/
│   │       └── unauthorized-page.tsx
│   │
│   ├── styles/
│   │   └── main.css
│   │
│   ├── types/
│   │   ├── common.ts
│   │   └── user.ts
│   │
│   └── utils/
│       ├── format-number.ts
│       └── format-time.ts
│
├── _vite/
│   ├── copy-i18n-files.ts
│   └── generate-client.ts
│
├── public/
│   ├── assets/
│   │   ├── background/
│   │   ├── icons/
│   │   ├── illustrations/
│   │   └── images/
│   ├── fonts/
│   ├── logo/
│   └── tx/
│
├── server/
│   └── app.ts
│
├── Dockerfile
├── package.json
├── react-router.config.ts
├── server.js
├── tsconfig.json
└── vite.config.ts
```

## Key Directories

- **`app/`** - Main application code
  - **`routes/`** - React Router route components (auth, authed, marketing, etc.)
  - **`components/`** - Reusable UI components (MUI-based)
  - **`lib/`** - Library code
    - `api-failure/` - API error handling
    - `js-client/` - Auto-generated API client
    - `react-query/` - TanStack Query hooks
    - `zustand/` - Global state management
    - `mui/theme/` - Material-UI theme configuration
  - **`layouts/`** - Layout components
  - **`hooks/`** - Custom React hooks
  - **`utils/`** - Utility functions

- **`public/`** - Static assets served directly (images, fonts, translations)

- **`server/`** - Server-side code (SSR)

- **`_vite/`** - Vite build scripts
