# B2 — Posts drafts page + composer: design

Date: 2026-08-22. Status: approved from owner decisions of 2026-08-22. Builds on PR #1158 (Post entity, tenant CRUD, `tenant.posts.view/create/edit/delete`, `POST /posts`, `GET /posts`, `GET /posts/{postId}`, `PATCH /posts/{postId}`, `DELETE /posts/{postId}`, body ≤ 20 000, keyset pagination `cursor/limit/sort_id/sort_order/q`, 422 `errors` map). Client: `packages/client-ts/src/posts/**` (Kiota). Part of #629, implements #638 scope (media/accounts/schedule out).

## 1. Decisions

| # | Question | Decision | Origin |
|---|---|---|---|
| 1 | Where is a post written? | **C — both**: drawer from drafts page (quick create: body + optional project) AND dedicated page `New post / Edit post` (editor centred; layout reserves side column for C/D account/schedule placeholders, but builds nothing for C/D now). | Owner 2026-08-22 verbatim |
| 2 | Drafts page shape | **A — table** like wired tenant list pages: columns `text excerpt · project · author · updated at · actions (Edit / Move to bin)`; search box; cursor pagination `Load more`. No cards. | Owner |
| 3 | Saving on edit page | **A — explicit Save** button, unsaved-changes warning on navigation; **all persistence through ONE function `savePost`** so autosave can call it later. | Owner |
| 4 | Edit route shape | `/tenant/posts/$postId/edit` as `apps/front/src/routes/authed/tenant/posts/$postId/edit.tsx`, wired in `apps/front/src/routes.ts` as `route('/tenant/posts/$postId/edit', ...)`. Dedicated create entry is the drafts drawer; no separate `/new` route in B2 (keeps one create path). | Plan (owner did not fix file name) |
| 5 | Drafts source of truth | `GET /posts` filtered to `status=draft` is **not** a new query param: drafts table lists **all** tenant posts (today all are drafts — `PostStatus.Draft` only state B1 writes). No status filter chips in B2. | Plan |
| 6 | Project select source | Optional project via `IProjectService.GetProjectsForTenantAsync` exposed as tenant endpoint `GET /projects` (already in model; client `client.projects.get`). If absent at wiring time, query resolves to empty list with `No projects — save without project` helper text; form still submits. | Plan |
| 7 | Save function contract | `savePost(input: { postId?: string; body: string; projectId: string | null }): Promise<PostDetail>` — create when `postId` absent (`POST /posts`), patch when present (`PATCH /posts/{id}` with `PatchField`). Single import for drawer + edit page. | Plan |
| 8 | Text preview length | `280` chars (server `BodyPreviewLength` used in `PostService.ToListItem`), truncated with ellipsis, `title` tooltip, `truncate` under `min-w-0`. | Plan |
| 9 | Delete semantics | `DELETE /posts/{id}` is soft-delete (`IsDeleted`); UI copy is **Move to bin** with confirm dialog, not "Delete forever". Success toast, row removed via invalidation. | Plan |
| 10 | Unsaved guard | `useBlocker` when `formState.isDirty && !isSubmitting`; browser `beforeunload` handler; dialog `You have unsaved changes — leave?` with Stay / Leave. | Plan |
| 11 | Pagination contract | Reuse `useTableController` + `CursorPaginatedQuery` keys `q/sort_id/sort_order/cursor/size` via `validateTenantPostListSearchParams` / `parse/serialize` helpers; footer is `DataTableCursorFooter` (Previous/Next), toolbar stays visible during selection. | Plan |
| 12 | Product failure rule | Every failure state carries **cause in plain words + next action**: query error → `StateSurface`/`ErrorStateSurface` with `getFailureMessage` text + Retry; mutation 422 → inline field errors + exhaustive root summary; 404/malformed id → shared not-found view (per `front/conventions.md` malformed→404). Never generic "something went wrong". | AGENTS.md / DESIGN.md §1.7, owner rule |

## 2. Screens

### 2.1 Drafts page — `apps/front/src/routes/authed/tenant/posts/drafts.tsx`

Wired page, `ssr: false` contract via authed layout. Layout: `div.publy-page-fill` with `PageHeader` ("Drafts" + description) and primary CTA `New post` (`variant="default"`, `IconPlus`) gated by `tenant.posts.create`; table owns scroll (`DataTable` inside `.publy-page-fill`).

Columns:
- `excerpt` (flex column, no fixed width): `Link to /tenant/posts/$postId/edit` wrapping truncated `bodyPreview` (280) with `publy-record-link` + `title`.
- `project` (`124px`, `hideBelow 768`): project name or `—` muted.
- `author` (`140px`, `hideBelow 900`): reserved for `createdByUserId` display name lookup (B2 shows short id fallback; no extra fetch).
- `updated_at` (`132px`): formatted `formatShortDate` / `formatDateTime`.
- `actions` (`40px`, `align:center`): `DataTableRowActions` with Edit (→ edit page) gated `tenant.posts.edit` and Move to bin gated `tenant.posts.delete`.

Toolbar: `DataTableToolbar` search (`q`), debounced via `useTableController` (300 ms); status filter not in B2. Footer: `DataTableCursorFooter`.

States (DESIGN.md flat states, `StateSurface`/`StateView`):
- Loading: `Skeleton` rows via `DataTable isPending`.
- Empty (no rows, no search): `StateSurface icon=IconPencil title=list-empty-title description=list-empty-default-description` + `New post` action.
- No-match (search active, 0 rows): `NoMatchStateSurface`.
- Error: `ErrorStateSurface` with `getFailureDescription` from `toApiFailure(query.error)` + Retry (`query.refetch`) + Go to home (buttonVariants outline). 401 on this authed surface → `LogoutRedirect`.

Selection: none in B2 (bulk deferred to later; single-row actions only).

Breadcrumbs: `staticData: { crumbs: () => [{kind:'label', labelKey:'posts', to:'/tenant/posts'}, {kind:'label', labelKey:'drafts'}], i18nNamespaces: ['posts'] }`.

### 2.2 Create drawer — `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx` (route-local `_` prefix)

Right-side `Drawer` (Base UI, `app.css .publy-drawer`) opened by `push` `?new=1`? No — B2 drawer is **state-driven over the drafts page** (no URL flag) to keep drafts pagination/search URL clean; `open` boolean owned by drafts page, `Drawer` `open`/`onOpenChange`. Primary CTA in header stays plain `Button`.

Form: `react-hook-form` + `zodResolver`, `DrawerForm` (`FormProvider`) with single scrolling `DrawerBody`.

Fields:
- `body` — `Textarea` required, `maxLength 20 000`, live counter `{{length}} / 20 000` (muted, turns `text-[var(--publy-danger)]` at >20k), `aria-describedby`.
- `projectId` — `Select` optional, options from `useTenantProjectsQuery`, placeholder `No project — personal draft`. Disabled while projects query pending; empty list shows helper `No projects yet`.

Validation: `z.object({ body: z.string().trim().min(1, t('body-required')).max(20000, t('body-too-long')), projectId: z.string().nullable().optional() })`. Server 422 `errors: { body: [...], projectId: [...] }` mapped via `mapValidationErrors` → `form.setError`; unmapped keys → `form.setError('root', ...)`.

Submit: `Save` (`variant="default"`, `type="submit"`, `isPending` spinner) calls `savePost({ body, projectId })` → `POST /posts` via `client.posts.post(createUntypedObject({ body: createUntypedString(body), projectId: projectId ? createUntypedString(projectId) : null }))`. On success: toast via global `MutationCache` (`successMessage: 'post-created-success'`), `invalidateTenantPosts(queryClient)`, close drawer, reset form, row appears at top (cursor desc).

Cancel/X: `DrawerClose` + `form.reset()`; dirty form confirms via `ConfirmDialog` (`Discard draft?`).

### 2.3 Edit page — `apps/front/src/routes/authed/tenant/posts/$postId/edit.tsx`

Dedicated page, editor centred, **side column reserved** (empty `div hidden lg:block lg:col-span-4` with comment `Account & schedule (Epics C/D) — reserved space`) — placeholder-free.

Route: `createFileRoute('/_authed-layout/tenant/posts/$postId/edit')({ staticData: { crumbs: (p) => [{kind:'label', labelKey:'posts', to:'/tenant/posts'}, {kind:'label', labelKey:'drafts', to:'/tenant/posts/drafts'}, {kind:'entity', ...postCrumbQuery}], i18nNamespaces: ['posts'] }, component: TenantPostEditPage })`. Validates `postId` as string only (conventions.md id-carrying param); non-UUID → not-found view.

Layout: `FormPageLayout` (like `staff/tenants/$tenantId-edit.tsx`) — back link `.publy-back-link` (`IconArrowLeft` → `/tenant/posts/drafts`), `PageHeader` title `Edit post`, two-column grid `lg:grid-cols-12` where form spans `lg:col-span-8` centre.

Data: `useTenantPostDetailsQuery({ postId })` via `buildTenantQueryOptions` / `client.posts.byPostId(postId).get()`. Loading → `TenantPostEditLoading` skeleton; error → `AppErrorView` branching on `shouldLogoutForFailure` vs `getFailureDescription` + `TenantPostEditRetryActions`; 404 or malformed `postId` → shared not-found view (`StateView` 404 code, `Go to home` button, plus `Back to drafts` outline button) per `Not-found vs bad-request`.

Form: same `body` + `projectId` schema as drawer; `defaultValues` hydrated from `toTenantPostDetails(data)` on success (`useEffect` sync). Single `savePost({ postId, body, projectId })` is the **only** writer (drawer and this page import same `savePost` from `~/lib/query/tenant-posts`).

Actions:
- `Save` (`variant="default"`) → `PATCH /posts/{id}` via `client.posts.byPostId(postId).patch(serializeUpdatePostBody(...))` with `PatchField` for `projectId`. Validation handled inline; success toast, `invalidateTenantPosts`, navigate back to drafts (`router.history.back()` with fallback `replace: /tenant/posts/drafts`).
- `Move to bin` (destructive, **not in header**, in dedicated Danger zone card at bottom of form: eyebrow + description + `Button variant="destructive"`): `ConfirmDialog` → `DELETE /posts/{id}` → toast → `invalidateTenantPosts` → back to drafts. Gated `tenant.posts.delete`; hidden when no permission (no disabled placeholder per bulk-action-ux but single-action gating allowed).

Unsaved guard: `useBlocker({ shouldBlockFn: () => form.formState.isDirty && !saving, withResolver: true })` + `window beforeunload` listener; dialog `Unsaved changes — leave without saving?` Stay/Leave.

i18n: all strings in `posts` namespace FR+EN (counter, placeholders, dialog copy, toasts); breadcrumbs via `staticData.crumbs`.

## 3. Data flow

```
Drafts page ──useTenantPostsQuery({ q, sort_id, sort_order, cursor, size })──► GET /posts
                │  queryKey: ['tenant','tenant-posts', tenantId, {q,sort_id,...}]
                │  fetcher: client.posts.get({ queryParameters: { q, sort_id, sort_order, cursor, limit } })
                └── rows: toTenantPostRows(data.data)  (id, bodyPreview, projectId, status, createdByUserId, createdAt, updatedAt)

Drawer Save ──savePost({body, projectId})──► POST /posts { body, projectId } ──► PostCreated
                └── onSuccess: invalidateTenantPosts(queryClient)  (scopedKey('tenant', TENANT_POSTS_QUERY_KEY))

Edit page ──useTenantPostDetailsQuery({postId})──► GET /posts/{postId} ──► PostDetail
            ──savePost({postId, body, projectId})──► PATCH /posts/{postId} { body?, projectId } (PatchField)
            ──deletePost({postId})──► DELETE /posts/{postId}
```

`savePost` lives in `apps/front/src/lib/query/tenant-posts.ts` and is the single writer imported by both surfaces (owner decision 3).

Invalidate helper: `export const invalidateTenantPosts = (qc, tenantId) => qc.invalidateQueries({ queryKey: scopedKey('tenant', TENANT_POSTS_QUERY_KEY) })`.

Tenant header: `X-Tenant-Id` injected by `getClientManager().getOrCreateClient(tenantId)` (existing seam).

Permissions: page actions gated by `useTenantPermissions()` / `AuthContext.HasPermission()` mirror (`tenant.posts.view` for list+detail, `create` for New post, `edit` for Edit/Save, `delete` for bin). Row actions enforce same.

## 4. Error handling

Backend invariants: RFC 7807 `application/problem+json` via `TypedProblems.*`; 422 carries `errors: Dictionary<string,string[]>` with stable keys `body`/`projectId`.

Frontend: central `ApiFailure` (`toApiFailure`/`getFailureMessage`/`shouldLogoutForFailure`).

| Surface | Failure | UI |
|---|---|---|
| Drafts query | 401 on authed surface → `LogoutRedirect` (only 401 logs out) | `shouldLogoutForFailure(error) ? <LogoutRedirect/> : <ErrorStateSurface ... retry>` |
| Drafts query | 403/400/500 → persistent error view | `StateSurface` danger icon, `list-unavailable-title` + `getFailureMessage(failure, {fallback: t('list-error-default-description')})` + Retry (refetch) + Go to home |
| Drafts query | 422 on list (q too long) → inline | `useTableController` already caps `q` at 256; server 422 maps to search field helper (not toast) |
| Drawer/Edit submit | 422 → field errors | `mapValidationErrors(failure, form.setError)` with exhaustive `root` fallback; toast suppressed (`validationHandledByForm: true`) |
| Drawer/Edit submit | 401 → silent + logout backstop | `makeErrorHandler('tenant',...)` logs out; mutation handler stays silent |
| Drawer/Edit submit | 400 malformed id → not-found | edit page treats 400 for `postId` as 404 view |
| Drawer/Edit submit | 404 not found → not-found view | edit page `StateView` 404 |
| Drawer/Edit submit | 403 insufficient role → toast | `getFailureMessage` via global `MutationCache` (unless `skipGlobalErrorHandler`) |
| Delete | 404 already gone → toast + invalidate | `toastLocalMutationResult` pattern like `tenants.tsx` bulk handler |
| Network/abort | network → toast, abort → silent | `toApiFailure` classification, `MutationCache` policy |

Never `console.*`; use `logger` if needed. Never translate `response-message` keys manually at call site (lint `publy/no-manual-response-message-translation`).

## 5. Tests

- Component (Vitest + Testing Library, jsdom) in draft/edit-adjacent files:
  - Drafts table states: loading skeleton, empty, no-match, error with retry, row renders excerpt+project+author+date, permission-gated actions, search debounce, cursor footer Previous/Next.
  - Drawer validation: body required / too long counter, project select options, 422 field mapping, root fallback.
  - Edit page: loads post, patches via `savePost`, unsaved-changes blocker, 404 not-found, bin confirm.
  - i18n coverage: `i18n-key-coverage.test.ts` must stay green (every `t('posts:...')` key present in `common`/`posts` EN+FR).
- Design-token scanner: `pnpm --filter front check:design-system` + `check:zindex` stay green (no raw colors, no stray `z-*`, correct radii).
- E2E (Playwright, tagged `@tenant-workspace @638` per PR #1171 on every top-level describe, one spec per screen flow):
  - `create draft via drawer → appears in table → open edit page → save → back` (happy path).
  - `search drafts + load more` (cursor).
  - `move to bin with confirmation` and `unsaved-changes guard` (edit page).
- Full front gate after every task: `pnpm --filter front test` (Vitest + guards) **and** `pnpm --filter front typecheck` — neither subsumes the other; `just ci-drift` unchanged.

## 6. Out of scope (B2)

Media (B3), accounts/publish/schedule (C/D), autosave (B2 drawer+page share `savePost` so autosave can call it later without new writer), calendar/queue/history pages (remain honest `StateSurface` placeholders).

## 7. File map (B2 touches)

- Modify: `apps/front/src/routes.ts` (new edit route), `apps/front/src/routes/authed/tenant/posts/drafts.tsx` (replace placeholder), `apps/front/src/routes/authed/tenant/posts/drafts.test.tsx`.
- Create: `apps/front/src/routes/authed/tenant/posts/$postId/edit.tsx`, `apps/front/src/routes/authed/tenant/posts/$postId/edit.test.tsx`, `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx`, `apps/front/src/lib/query/tenant-posts.ts` (queries+mutations+savePost), `apps/front/src/lib/query/tenant-projects.ts` (project select), `apps/front/src/lib/url-state/tenant-post-list-helpers.ts`, `apps/front/e2e/tenant-posts-drafts.spec.ts`.
- i18n: `packages/shared-ts/lib/i18n/json/common.en.json`, `common.fr.json`, `posts.en.json`, `posts.fr.json` (or front `src/i18n/locales/*` mirror per repo layout — whichever the coverage test asserts).
