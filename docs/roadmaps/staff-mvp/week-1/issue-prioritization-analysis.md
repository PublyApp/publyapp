# Issue Prioritization Analysis

> Note (2026-01): Since this document was written, the API migrated error responses to RFC 7807 `application/problem+json` (`AppProblemDetails` / `ValidationProblemDetails`). Treat any `ApiResponse`-based error-response references as historical.

**Date:** December 5, 2025
**Total Open Issues:** 27
**Context:** Just completed Staff MVP Week 1, preparing for Week 2

---

## 🚨 CRITICAL PRIORITY (Do Now)

These issues directly impact your current Staff MVP work or are blocking development:

### #127 - Implement staff invitations table and actions
**Status:** ✅ **ALREADY COMPLETED IN WEEK 1**
**Action:** Close this issue - it's been fully implemented
**Reason:** Week 1 implementation includes complete invitation system with table and all CRUD actions

### #94 - Fix typescript errors in staff-tenants module
**Priority:** 🔴 **CRITICAL**
**Impact:** Blocks Week 2 tenant management features
**Effort:** Medium (2-3 hours)
**Why Now:** Week 2 requires working with tenant management UI
**Action:** Fix TS errors before starting Week 2 work

### #80 - Add adequate authorization filter/permissions check on ALL endpoints
**Priority:** 🔴 **CRITICAL**
**Impact:** Security vulnerability, production blocker
**Effort:** High (1-2 days)
**Why Now:** Should be done before Week 2 adds more endpoints
**Action:** Audit all endpoints and add permission checks

---

## 🔥 HIGH PRIORITY (Do This Week)

These significantly improve development workflow or are needed for Week 2:

### #87 - Implement tenant authorization logic in TenantAuthFilter
**Priority:** 🟠 **HIGH**
**Impact:** Required for secure tenant operations in Week 2
**Effort:** Medium (3-4 hours)
**Why Now:** Week 2 tenant management depends on this
**Action:** Implement before tenant suspend/reactivate features

### #123 - Refactor junction tables to use composite primary keys
**Priority:** 🟠 **HIGH**
**Impact:** Database performance, follows best practices
**Effort:** Medium (4-6 hours)
**Why Now:** Better to do before adding more junction tables
**Action:** Refactor existing junction tables (UserAccountProfile, InvitationProfile, etc.)
**Note:** InvitationProfile already uses composite PK - use as reference

### #116 - Use ProblemDetails instead of ApiResponse class
**Priority:** 🟠 **HIGH**
**Impact:** API standards compliance, better error handling
**Effort:** High (1-2 days)
**Why Now:** Week 1 just added many endpoints with ApiResponse
**Action:** Consider migrating to RFC 7807 ProblemDetails standard

### #90 - Clean-up MainApiDbContext onModelCreating
**Priority:** 🟠 **HIGH**
**Impact:** Code maintainability, Week 1 added more entities
**Effort:** Low (1-2 hours)
**Why Now:** Good time to refactor after Week 1 additions
**Action:** Extract entity configurations to separate files

---

## ⚠️ MEDIUM PRIORITY (Plan for Later)

Important but not blocking current work:

### #117 - TenantContext information should be part of AuthContext
**Priority:** 🟡 **MEDIUM**
**Impact:** Cleaner architecture
**Effort:** Medium (3-4 hours)
**Timing:** Can be done during Week 2 or 3

### #118 - Move StaffUser slice under the UserAsStaff slice
**Priority:** 🟡 **MEDIUM**
**Impact:** Better code organization
**Effort:** Low (1-2 hours)
**Timing:** Refactoring opportunity after Staff MVP complete

### #115 - Rewrite PasswordService into a Util static class
**Priority:** 🟡 **MEDIUM**
**Impact:** Slight performance improvement, simpler code
**Effort:** Low (1 hour)
**Timing:** Low risk, can do anytime

### #114 - Add delete action button to details pages
**Priority:** 🟡 **MEDIUM**
**Impact:** Better UX
**Effort:** Low (2-3 hours)
**Timing:** Good for Week 2 frontend work

### #122 - Enable compression middleware
**Priority:** 🟡 **MEDIUM**
**Impact:** Performance improvement
**Effort:** Low (1 hour)
**Timing:** Pre-production optimization

### #77 - Remove barrel files (index.ts)
**Priority:** 🟡 **MEDIUM**
**Impact:** Build performance, better imports
**Effort:** Medium (3-4 hours)
**Timing:** Can be done gradually

---

## 📋 LOW PRIORITY (Nice to Have)

These are improvements but not urgent:

### #120 - Use cursor based pagination everywhere
**Priority:** 🟢 **LOW**
**Impact:** Better performance at scale
**Effort:** High (2-3 days)
**Timing:** Optimize after MVP complete

### #121 - react-querybuilder integration into table components
**Priority:** 🟢 **LOW**
**Impact:** Enhanced filtering UX
**Effort:** High (2-3 days)
**Timing:** Feature enhancement for later

### #119 - PermissionPool/PermissionEnum values must be immutable
**Priority:** 🟢 **LOW**
**Impact:** Type safety improvement
**Effort:** Low (1-2 hours)
**Timing:** Nice refactoring opportunity

### #57 - Add rate limit to critical endpoints
**Priority:** 🟢 **LOW** (but important for production)
**Impact:** DoS protection
**Effort:** Medium (3-4 hours)
**Timing:** Pre-production hardening

### #58 - Implement an adaptive caching solution
**Priority:** 🟢 **LOW**
**Impact:** Performance optimization
**Effort:** High (3-4 days)
**Timing:** Performance tuning phase
**Note:** Has detailed implementation plan in comments

### #60 - Implement API endpoint tests and Playwright tests
**Priority:** 🟢 **LOW** (but critical for production)
**Impact:** Quality assurance
**Effort:** Very High (1-2 weeks)
**Timing:** After core features complete

### #95 - Implement file upload
**Priority:** 🟢 **LOW**
**Impact:** Feature addition
**Effort:** Medium (4-6 hours)
**Timing:** When file upload is needed for features

---

## 🔧 INFRASTRUCTURE (Plan Strategically)

Large infrastructure changes that need careful planning:

### #102 - Figure out how to build and deploy
**Priority:** 🔵 **INFRASTRUCTURE**
**Impact:** Production deployment
**Effort:** High (2-3 days)
**Timing:** Before production launch, can be parallel work
**Action:** Document deployment strategy, CI/CD pipeline

### #101 - Migrate to .NET 10
**Priority:** 🔵 **INFRASTRUCTURE**
**Impact:** Latest features, security updates
**Effort:** Medium (1 day)
**Timing:** After Staff MVP stable, before production
**Note:** .NET 10 just released (Nov 2024)

### #125 - Upgrade to Vite 8
**Priority:** 🔵 **INFRASTRUCTURE**
**Impact:** Build performance, latest features
**Effort:** Low-Medium (2-4 hours)
**Timing:** Test in dev environment first

### #124 - Upgrade TypeScript (?)
**Priority:** 🔵 **INFRASTRUCTURE**
**Impact:** Latest features, better type checking
**Effort:** Low (1-2 hours)
**Timing:** Can be done with Vite upgrade

### #103 - Remove dependency on turbo (?)
**Priority:** 🔵 **INFRASTRUCTURE**
**Impact:** Simpler build setup
**Effort:** Medium (4-6 hours)
**Timing:** Needs evaluation - is turbo causing issues?

### #49 - Use an automated DI services registration system
**Priority:** 🔵 **INFRASTRUCTURE**
**Impact:** Cleaner service registration
**Effort:** Medium (4-6 hours)
**Timing:** After current manual registrations stable
**Note:** Has implementation plan in comments (Scrutor)

---

## 📊 RECOMMENDED ACTION PLAN

### This Week (Week 1 Cleanup + Week 2 Prep)
1. **Close #127** - Staff invitations already implemented ✅
2. **Fix #94** - TypeScript errors in staff-tenants (2-3 hours) 🔴
3. **Implement #87** - TenantAuthFilter authorization (3-4 hours) 🔴
4. **Review #80** - Audit endpoint permissions (start, ongoing) 🔴

### Week 2 (Parallel with Week 2 Features)
5. **Refactor #123** - Junction tables composite PKs (4-6 hours) 🟠
6. **Clean #90** - DbContext refactoring (1-2 hours) 🟠
7. **Consider #116** - ProblemDetails migration (evaluate first) 🟠

### Week 3-4 (After Staff MVP Core Complete)
8. **Complete #80** - All endpoint permissions 🔴
9. **Improve #114** - Delete buttons on details pages 🟡
10. **Enable #122** - Compression middleware 🟡
11. **Plan #102** - Deployment strategy 🔵

### Before Production
12. **Implement #60** - Comprehensive testing 🟢
13. **Add #57** - Rate limiting 🟢
14. **Upgrade #101** - .NET 10 migration 🔵
15. **Security audit** - Review all issues tagged security

### Post-MVP Optimization
16. **Implement #58** - Caching solution 🟢
17. **Implement #120** - Cursor pagination 🟢
18. **Consider #49** - Automated DI registration 🔵

---

## 💡 IMMEDIATE NEXT STEPS (Today/Tomorrow)

1. **Close Issue #127** ✅
   ```bash
   gh issue close 127 --comment "Completed in Week 1 Staff MVP implementation. Full invitation system with table, CRUD actions, and frontend UI is now live. See PR #XXX for details."
   ```

2. **Fix Issue #94** 🔴
   - Navigate to staff-tenants module
   - Fix TypeScript errors
   - Run `make tsc-front` to verify
   - Estimated: 2-3 hours

3. **Implement Issue #87** 🔴
   - Add tenant authorization logic to TenantAuthFilter
   - Required for Week 2 tenant management
   - Estimated: 3-4 hours

4. **Start Audit of Issue #80** 🔴
   - List all endpoints without permission checks
   - Create implementation plan
   - This can be ongoing work

---

## 🎯 PRIORITIZATION MATRIX

| Issue | Impact | Effort | Urgency | Priority |
|-------|--------|--------|---------|----------|
| #127 | ✅ Done | N/A | N/A | Close |
| #94 | High | Medium | High | 🔴 P0 |
| #80 | Critical | High | High | 🔴 P0 |
| #87 | High | Medium | High | 🔴 P0 |
| #123 | High | Medium | Medium | 🟠 P1 |
| #116 | High | High | Medium | 🟠 P1 |
| #90 | Medium | Low | Medium | 🟠 P1 |
| #117-122 | Medium | Various | Low | 🟡 P2 |
| #119-121 | Low | Various | Low | 🟢 P3 |
| #60, #57, #58 | High* | High | Low** | 🟢 P3*** |
| #101-103 | High | Medium | Low | 🔵 Infra |
| #49 | Medium | Medium | Low | 🔵 Infra |

\* High impact for production, but not blocking current development
\** Low urgency for MVP phase
\*** Move to P0 before production launch

---

## 📝 NOTES

- **Week 1 Context:** Just completed full invitation system, audit logging, impersonation
- **Week 2 Focus:** Tenant management UI, active impersonation, system notices
- **Technical Debt:** Several architectural improvements identified (#116, #123, #90)
- **Security:** Critical gaps in authorization (#80, #87)
- **Testing:** Large gap in test coverage (#60) - address before production

---

## ✅ SUCCESS METRICS

After addressing P0 and P1 issues:
- ✅ All TypeScript errors fixed
- ✅ All endpoints have proper authorization
- ✅ Database follows best practices (composite PKs)
- ✅ Clean, maintainable codebase
- ✅ Ready for Week 2 implementation
- ✅ On track for production readiness

---

**Recommendation:** Focus on closing #127 and fixing #94, #87, #80 this week while starting Week 2 development in parallel.
