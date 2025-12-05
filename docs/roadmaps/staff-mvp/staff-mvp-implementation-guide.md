# PublyApp — Staff Backoffice MVP Implementation Guide (Solo Developer)

**Last Updated:** December 5, 2025
**Status:** Week 1 Complete ✅ | Week 2 In Progress 🚧

---

## 0. Baseline review & setup (Week 0) ✅ [COMPLETE]

- ✅ Inventoried existing staff capabilities: `apps/api/Src/Modules/Staff/{TenantsAsStaff,UsersAsStaff,ProfilesAsStaff}` services
- ✅ Confirmed authentication flow uses shared `UserAccount` with `AccountScope.Staff`
- ✅ Defined Owner bootstrap secrets (`STAFF_OWNER_EMAIL`, `STAFF_OWNER_BOOTSTRAP_CODE`) in `.env.development`
- ✅ Captured baseline: Current database tables reviewed, migration order confirmed
- 📋 **Deferred:** Transactional email (SendGrid/SES) - using password login for MVP
- 📋 **Deferred:** Data Protection key ring for magic-link tokens - using token-based invitations

---

## Week 1: Invitation & Audit Foundations ✅ [COMPLETE]

**Status:** 100% Complete (December 2025)
**Actual Time:** 19-26 hours (~3-4 focused work days)

### Objectives
~~Extend data model for invitations/roles and seed Owner account.~~
**ACHIEVED:** Delivered complete invitation system with unified architecture, owner bootstrap, audit logging, impersonation infrastructure, system notice entity, and full frontend.

### What Was Delivered

**Backend (Phase 1-4):**
1. ✅ **Environment & Seeding**
   - Added `STAFF_OWNER_EMAIL` and `STAFF_OWNER_BOOTSTRAP_CODE` to `.env.development`
   - Extended `UserSeeder` to create owner from environment
   - Extended `UserAccountSeeder` to create staff account with `AccountLevel.Admin`
   - Created `StaffProfileSeeder` for three staff profiles (Owner, Admin, Support)

2. ✅ **New Entities**
   - `Invitation` (unified): Supports Staff/Tenant/Project scopes with discriminator pattern
   - `InvitationProfile` (junction): Composite PK, supports multi-profile invitations
   - `AuditLog`: Generic audit logging with action, target, JSON details
   - `SystemNotice`: Severity-based system alerts (Info/Warning/Critical)
   - `Session` (extended): Added impersonation fields (IsImpersonation, ImpersonatingStaffUserId, etc.)

3. ✅ **Database Integration**
   - Registered all entities in `MainApiDbContext`
   - Created comprehensive migration: `20251129183554_Init`
   - Applied migration successfully to dev database

4. ✅ **Core Services**
   - `InvitationService`: Create, validate, revoke, bulk operations
   - `AuditLogService`: Log actions with IP/user agent capture
   - `ImpersonationService`: Create/validate impersonation sessions
   - All services registered in DI (`AppServices.cs`)

**API Endpoints (Phase 5):**
5. ✅ **Anonymous Endpoints** (bypass auth)
   - `GET /invitations/{token}/details` - Get invitation details
   - `POST /invitations/{token}/accept` - Accept invitation and create account
   - `GET /invitations/check` - Token validation

6. ✅ **Staff Endpoints** (require staff auth)
   - `POST /staff/invitations/` - Create single invitation
   - `POST /staff/invitations/bulk` - Bulk create invitations
   - `GET /staff/invitations/` - List staff invitations
   - `DELETE /staff/invitations/{invitationId}` - Revoke invitation

**Frontend (Phase 6):**
7. ✅ **Complete UI Implementation**
   - Invitation acceptance page: `/auth/accept-invitation`
   - Staff invitation management: `/authed/staff/invitations/new` and `/authed/staff/invitations`
   - Staff invitations table component with status tracking
   - TypeScript validation schemas and API hooks
   - Translation keys for all UI elements

### Architectural Improvements Over Original Plan

**Better Patterns Used:**
- ✅ **Unified `Invitation` table** instead of separate `StaffInvitation` (follows `UserAccount` pattern)
- ✅ **Reused `Profile` system** instead of creating `StaffRoleAssignment` table
- ✅ **Extended `Session` entity** instead of creating `StaffImpersonationToken` table
- ✅ **Minimal seeding** - Structure only, no relationship assignments

**Benefits:**
- Fewer database tables (simpler schema)
- Consistent architectural patterns
- Better code reuse
- Future-proof for Tenant/Project invitations

### Acceptance Criteria Met
- ✅ Migration applies cleanly; owner account created with `AccountScope.Staff` and `AccountLevel.Admin`
- ✅ Token-based invitation system with secure token generation
- ✅ Complete frontend for invitation acceptance and management
- ✅ Audit logging captures all invitation actions
- ✅ Multi-profile assignments supported per invitation

### Deferred from Week 1
- ⏭️ Magic-link authentication (using password login instead)
- ⏭️ Email delivery service integration (manual token sharing for MVP)
- ⏭️ Unit tests (focus on implementation first)

---

## Week 2: Tenant Management & Active Impersonation 🚧 [IN PROGRESS]

**Status:** 0% Complete
**Estimated Time:** 33-44 hours (~5-6 focused work days)

### Objectives
~~Ship invite issuance/consumption endpoints and session middleware updates.~~
**REVISED:** Make staff portal operationally useful with tenant administration, active impersonation UI, system notices, and audit log viewer.

### Why This Changed
Week 1 completed invitation endpoints AND frontend, which was originally split between Week 1-2. Now Week 2 focuses on tenant operations, which are critical for staff to manage customers effectively. Fixing Issue #94 (TypeScript errors in tenant module) is the perfect opportunity to enhance the tenant management features.

### Tasks

#### Backend Tasks (12-16 hours)

1. **Fix Tenant Authorization (Issue #87)** - 3-4 hours
   - Implement `TenantAuthFilter` authorization logic
   - Ensure proper permission checks for tenant operations
   - Add role-based access control for tenant actions
   - **Files:** `apps/api/Src/Lib/Filters/TenantAuthFilter.cs`

2. **Tenant Suspend/Reactivate** - 4-6 hours
   - Create `SuspendTenantAsync(tenantId, reason, staffUserId)` handler
   - Create `ReactivateTenantAsync(tenantId, reason, staffUserId)` handler
   - Update `Tenant` entity with `IsSuspended` tracking (if not exists)
   - Log all actions via `AuditLogService`
   - Add endpoints:
     - `POST /staff/tenants/{id}/suspend`
     - `POST /staff/tenants/{id}/reactivate`
   - **Files:** `apps/api/Src/Modules/Staff/TenantsAsStaff/`

3. **Tenant Usage Aggregation** - 2-3 hours
   - Create `GetTenantUsageAsync(tenantId)` method
   - Aggregate: user count, project count, schedule count, last activity
   - Add endpoint: `GET /staff/tenants/{id}/usage`
   - **Files:** `apps/api/Src/Modules/Staff/TenantsAsStaff/TenantUsageService.cs`

4. **Impersonation Start/End Endpoints** - 2-3 hours
   - `POST /staff/impersonation/start` - Uses existing `ImpersonationService`
   - `POST /staff/impersonation/end` - Terminates active session
   - `GET /staff/impersonation/active` - Check current impersonation status
   - **Files:** `apps/api/Src/Modules/Staff/Impersonations/ImpersonationEndpoints.cs`

5. **System Notice CRUD** - 2-3 hours
   - `POST /staff/notices` - Create notice
   - `GET /staff/notices` - List all notices
   - `PATCH /staff/notices/{id}` - Update notice
   - `DELETE /staff/notices/{id}` - Delete notice
   - `GET /notices/active` - Public endpoint for active notices
   - **Files:** `apps/api/Src/Modules/Staff/SystemNotice/SystemNoticeEndpoints.cs`

6. **Audit Log Query Endpoints** - 2-3 hours
   - `GET /staff/audit-logs` - Paginated list with filters
   - Add filters: userId, action, dateRange, targetId
   - `GET /staff/audit-logs/export` - Export to CSV/JSON
   - **Files:** `apps/api/Src/Modules/Staff/AuditLogs/AuditLogEndpoints.cs`

#### Frontend Tasks (21-28 hours)

1. **Fix Issue #94: TypeScript Errors in Tenant Module** - 3-4 hours ⚠️ **START HERE**
   - Navigate to `apps/front/app/routes/authed/staff/tenants/`
   - Fix all TypeScript compilation errors
   - Run `make tsc-front` to verify
   - Update type definitions as needed
   - **Critical:** Must be done before enhancing tenant UI

2. **Tenant List Enhancements** - 4-5 hours
   - Add status column with badges (Active/Suspended)
   - Add quick action buttons: Suspend, Reactivate, View Usage
   - Add usage summary column (user count, project count)
   - Add impersonation action button
   - **Files:** `apps/front/app/routes/authed/staff/tenants/list/`

3. **Tenant Details Tabs** - 6-8 hours
   - Create tab layout: Overview, Usage, Activity, Users
   - **Overview Tab:**
     - Basic tenant info
     - Suspend/Reactivate button with confirmation dialog
     - Status badge
   - **Usage Tab:**
     - Metrics cards (users, projects, schedules)
     - Usage charts (if time allows)
   - **Activity Tab:**
     - Audit log timeline for this tenant
     - Filter by action type
   - **Users Tab:**
     - List of tenant users
     - User status indicators
   - **Files:** `apps/front/app/routes/authed/staff/tenants/details/`

4. **Impersonation UI** - 4-6 hours
   - **Impersonation Modal:**
     - Trigger from tenant list or details
     - Reason input (required for audit)
     - Duration selector (15/30/60 minutes)
     - Start impersonation button
   - **Impersonation Banner:**
     - Shows "Impersonating: [Tenant Name]"
     - Time remaining countdown
     - "End Impersonation" button
     - Displayed at top of all pages when active
   - **Session Handling:**
     - Redirect to tenant app on impersonation start
     - Return to staff portal on end
   - **Files:**
     - `apps/front/app/components/staff/impersonation-modal.tsx`
     - `apps/front/app/components/staff/impersonation-banner.tsx`

5. **System Notices Management** - 3-4 hours
   - Create notices management page at `/authed/staff/notices`
   - Create/edit form with:
     - Title, message inputs
     - Severity selector (Info/Warning/Critical)
     - Start/end date-time pickers
   - Notices list table with actions
   - Notice banner component (severity-colored)
   - **Files:**
     - `apps/front/app/routes/authed/staff/notices/`
     - `apps/front/app/components/staff/notice-banner.tsx`

6. **Audit Log Viewer** - 3-4 hours
   - Create audit log page at `/authed/staff/audit`
   - Filterable data table:
     - User filter
     - Action type filter
     - Date range picker
     - Target entity filter
   - Export button (CSV/JSON download)
   - Inline audit displays on tenant details
   - **Files:** `apps/front/app/routes/authed/staff/audit/`

7. **API Client Generation & Hooks** - 1-2 hours
   - Run `make build-api && make generate-client`
   - Create react-query hooks:
     - `useSuspendTenant`, `useReactivateTenant`
     - `useGetTenantUsage`
     - `useStartImpersonation`, `useEndImpersonation`
     - `useSystemNotices`, `useCreateNotice`
     - `useAuditLogs`
   - **Files:** `apps/front/app/lib/react-query/features/staff/`

### Acceptance Criteria
- ✅ All TypeScript errors in tenant module resolved (Issue #94)
- ✅ Staff can suspend/reactivate tenants from UI with confirmation dialogs
- ✅ Tenant usage metrics (users, projects, schedules) displayed accurately
- ✅ Staff can start impersonation sessions with reason capture
- ✅ Impersonation banner shows active session with time remaining
- ✅ Staff can end impersonation and return to staff portal
- ✅ System notices can be created with severity and date/time
- ✅ Active notices displayed in banner component
- ✅ Audit logs viewable with filters (user, action, date range)
- ✅ Audit logs exportable to CSV/JSON
- ✅ All tenant actions logged in audit trail
- ✅ Tenant authorization logic implemented (Issue #87)

### Week 2 Development Flow

**Day 1 (Monday): Critical Fixes & Backend Foundation**
- Morning: Fix Issue #94 (TypeScript errors) - 3-4 hours
- Afternoon: Implement Issue #87 (TenantAuthFilter) - 3-4 hours

**Day 2 (Tuesday): Tenant Management Backend**
- Morning: Tenant suspend/reactivate handlers - 3 hours
- Afternoon: Tenant usage aggregation service - 2-3 hours

**Day 3 (Wednesday): Tenant Management Frontend**
- Morning: Enhance tenant list UI - 2-3 hours
- Afternoon: Start tenant details tabs (Overview + Usage) - 3-4 hours

**Day 4 (Thursday): Impersonation & Notices**
- Morning: Complete tenant details tabs (Activity + Users) - 2-3 hours
- Afternoon: Impersonation UI (modal + banner) - 4 hours

**Day 5 (Friday): System Notices & Audit Viewer**
- Morning: System notices CRUD + banner - 3-4 hours
- Afternoon: Audit log viewer with filters - 3-4 hours

**Day 6 (Weekend/Buffer): Testing & Polish**
- Test all Week 2 features end-to-end
- Fix bugs and edge cases
- Update documentation
- Close relevant issues

---

## Week 3: Support Tooling Backend ⏭️ [PLANNED]

**Objectives**: Introduce job search, retry/cancel operations, and dashboard metrics.

**Tasks:**
1. Create `SupportAsStaff` feature folder with job search endpoints
2. Implement schedule retry/cancel operations (wrap existing scheduling services)
3. Build dashboard metrics aggregation API (tenant counts, job stats)
4. Add background cleanup jobs for expired sessions/invitations (Hangfire)
5. Add unit/integration tests for support operations

**Acceptance Criteria:**
- API can locate jobs by tenant or schedule ID
- Retry/cancel operations respect tenant boundaries
- Metrics API returns accurate statistics
- Expired sessions/invitations automatically cleaned up

---

## Week 4: Support Center UI & Dashboard ⏭️ [PLANNED]

**Objectives**: Deliver Support Center experience and dashboard widgets.

**Tasks:**
1. Add `/authed/staff/support` route with search panel and results table
2. Implement retry/cancel buttons calling new APIs
3. Build dashboard widgets for metrics cards (active tenants, suspended, job failure rate)
4. Surface Hangfire dashboard link with role guard (Owner/Admin only)
5. Add UI integration tests covering search + retry flows

**Acceptance Criteria:**
- Support staff can search, inspect, and act on jobs from UI
- Dashboard displays live metrics and system health
- Hangfire link available only for authorized roles

---

## Week 5: Staff Management Enhancements ⏭️ [PLANNED]

**Objectives**: Manage staff lifecycle and enhance role management.

**Tasks:**
1. Add last login timestamp tracking to session creation
2. Update staff list routes to display last login and invitation status
3. Implement role change UI (using existing Profile assignment system)
4. Build staff revocation flow with audit reason capture
5. Add invitation resend functionality
6. Ensure audit drawer available for role changes

**Acceptance Criteria:**
- Owner/Admin can modify staff roles via UI
- Last login displayed on staff list
- Revoked staff cannot access system
- Audit trail captures all role changes

---

## Week 6: Polish & Advanced Features ⏭️ [PLANNED]

**Objectives**: Email integration, advanced audit features, UX polish.

**Tasks:**
1. Integrate email service for invitation delivery (SendGrid/SES)
2. Advanced audit log features (detailed views, multi-entity export)
3. Responsive design improvements across staff portal
4. Error handling and loading state refinements
5. User feedback optimization (toasts, confirmations, empty states)

**Acceptance Criteria:**
- Invitations delivered via email automatically
- Audit logs support complex filtering and export formats
- Staff portal works seamlessly on mobile and tablet
- All user actions have appropriate feedback

---

## Week 7: Testing & Quality Assurance ⏭️ [PLANNED]

**Objectives**: Comprehensive testing, security review, performance optimization.

**Tasks:**
1. Implement Issue #60: API endpoint tests (xUnit) and Playwright E2E tests
2. Conduct security review addressing Issues #80, #87, #57
3. Add rate limiting to critical endpoints (invitations, login)
4. Performance optimization: query analysis, caching strategy, bundle optimization
5. Load testing for staff operations
6. Fix all identified bugs and security issues

**Acceptance Criteria:**
- All tests pass locally and in CI
- Security review findings addressed
- Rate limits behave correctly under load
- Performance meets targets (API <200ms, UI <2s load)

---

## Week 8: Hardening & Production Prep ⏭️ [PLANNED]

**Objectives**: Finalize reliability, monitoring, and documentation.

**Tasks:**
1. Complete operational documentation (runbooks, environment variables, deployment guide)
2. Prepare deployment checklist and migration guide
3. Final security audit (CSRF, XSS, session fixation, SQL injection)
4. Verify cookies flagged `Secure`/`HttpOnly` with correct `SameSite` policies
5. Smoke test all staff workflows end-to-end on staging
6. Prepare release notes and changelog

**Acceptance Criteria:**
- Documentation complete and accurate
- Deployment checklist validated on staging environment
- All security findings resolved
- Staff portal production-ready with monitoring

---

## Testing & Verification Cues

### Backend Testing
- **Unit Tests:** Auth services, invitation expiration, tenant usage aggregation, impersonation tokens
- **Integration Tests:** Use `WebApplicationFactory` for critical endpoint flows
- **Database Tests:** Verify migrations, seeding, and constraint enforcement
- **Security Tests:** Permission checks, authorization filters, SQL injection prevention

### Frontend Testing
- **Component Tests:** React Testing Library for tenant details, impersonation modal
- **Integration Tests:** Test API hook interactions with mock server
- **E2E Tests:** Cypress/Playwright journeys (invite acceptance, tenant suspension, impersonation)
- **Manual Testing:** Dry-run staff workflows against dev database

### Manual Verification Checklist (Week 2)

**Database:**
```bash
# Verify tables exist
\dt

# Check owner account
SELECT email, first_name, last_name FROM users WHERE email = 'owner@publyapp.local';

# Check staff profiles
SELECT name, description, scope FROM profiles WHERE scope = 0;

# Verify session impersonation columns
\d session
```

**API Testing:**
```bash
# Test tenant suspend (requires auth token)
curl -X POST http://localhost:5000/staff/tenants/{id}/suspend \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Testing suspension"}'

# Test tenant usage
curl -X GET http://localhost:5000/staff/tenants/{id}/usage \
  -H "Authorization: Bearer {token}"

# Test impersonation start
curl -X POST http://localhost:5000/staff/impersonation/start \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "{id}", "reason": "Support session", "durationMinutes": 30}'
```

**Frontend Testing:**
- Navigate to `/authed/staff/tenants`
- Verify status badges display correctly
- Test suspend/reactivate with confirmation
- View tenant details tabs (Overview, Usage, Activity)
- Start impersonation and verify banner appears
- End impersonation and return to staff portal
- Create system notice and verify banner displays
- View audit logs with filters

---

## Deployment Checklist

### Environment Variables (Updated for Week 2)
```bash
# Existing (Week 1)
STAFF_OWNER_EMAIL=owner@yourdomain.com
STAFF_OWNER_BOOTSTRAP_CODE=<secure-random-string>

# New for Week 2+
STAFF_SESSION_COOKIE_NAME=staff_session
STAFF_IMPERSONATION_TOKEN_TTL_MINUTES=60
SMTP_HOST=<if-email-enabled>
SMTP_PORT=<if-email-enabled>
SMTP_USERNAME=<if-email-enabled>
SMTP_PASSWORD=<if-email-enabled>
```

### Pre-Deployment Steps
1. Run migrations: `make db-migrate`
2. Verify owner seeded: Check database for owner account
3. Verify staff profiles seeded: Query profiles table
4. Generate API client: `make generate-client`
5. Build frontend: `make build-front`
6. Run tests: `make test` (when implemented)

### Production Deployment
1. Update environment variables on hosting platform
2. Apply database migrations in production
3. Verify owner account created via seeding
4. Test invitation acceptance flow end-to-end
5. Verify audit logs are being created
6. Test tenant suspend/reactivate (Week 2+)
7. Test impersonation flow (Week 2+)
8. Monitor error logs for first 24 hours

---

## Progress Tracking

| Week | Status | Progress | Key Deliverables |
|------|--------|----------|------------------|
| Week 1 | ✅ Complete | 100% | Unified invitations, owner bootstrap, audit logging, impersonation infra, full frontend |
| Week 2 | 🚧 In Progress | 0% | Tenant management (suspend/reactivate, usage), impersonation UI, system notices, audit viewer, Issue #94 fix |
| Week 3 | ⏭️ Planned | 0% | Support tooling backend, job search, dashboard metrics |
| Week 4 | ⏭️ Planned | 0% | Support Center UI, Hangfire integration, dashboard widgets |
| Week 5 | ⏭️ Planned | 0% | Staff role management, last login tracking, invitation resend |
| Week 6 | ⏭️ Planned | 0% | Email integration, advanced audit features, UX polish |
| Week 7 | ⏭️ Planned | 0% | Comprehensive testing, security review, performance optimization |
| Week 8 | ⏭️ Planned | 0% | Documentation, production deployment, final QA |

**Overall Progress:** 12.5% (1/8 weeks complete)
**Estimated Completion:** Late February 2026

---

## Key Learnings from Week 1

### What Worked Well ✅
1. **Unified patterns** - Single Invitation table instead of multiple scope-specific tables
2. **Reused existing systems** - Profile for roles, Session for impersonation
3. **Complete vertical slices** - Each feature implemented end-to-end (backend + frontend)
4. **Database-generated UUIDs** - UUID v7 pattern simplifies ID management
5. **Minimal seeding** - Structure only, no relationship seeding

### What to Maintain 🎯
1. Follow existing architectural patterns (don't create new tables unnecessarily)
2. Use LINQ query syntax for all database queries
3. Use `is`/`is not` for null checks (never `==`/`!=`)
4. Add `CancellationToken` to all async methods
5. Implement features completely (backend + frontend + testing together)

### What to Improve 📈
1. **Address security first** - Fix Issues #80, #87 before adding more features
2. **Fix TypeScript errors early** - Issue #94 should be resolved before enhancing UI
3. **Add tests alongside development** - Don't defer testing to Week 7
4. **Balance features with tech debt** - Schedule time for refactoring (#123, #90)

---

**Next Action:** Fix Issue #94 (TypeScript errors in tenant management module) - this is the perfect entry point for Week 2's tenant management enhancements! 🚀
