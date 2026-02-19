# API Startup Audit (Codex)

Date: 2026-02-19
Scope: Audit-only (no product code changes in this pass)
Reference context: `docs/reviews/api-startup-time-audit.md` exists; this report is an independent analysis.

## 1) What I audited

- Git history for startup-path files:
  - `apps/api/MainApi.csproj`
  - `apps/api/Program.cs`
  - `apps/api/Src/Lib/ServiceRegistration.cs`
  - `apps/api/Src/Lib/DI/ServiceScanner.cs`
  - `apps/api/Src/Lib/DI/ServiceValidator.cs`
  - `apps/api/Src/Data/DbContext/MainApiDbContext.cs`
- Growth over time (services/entities/seeders and DbContext model complexity)
- Measured current startup/build behavior from CLI

## 2) Key measured facts (current workspace)

### Runtime app host startup is fast

- `MainApi.exe` startup to "Now listening": ~`789ms`
- `dotnet apps/api/bin/Debug/net10.0/MainApi.dll`: ~`942ms`

Interpretation: the API host itself is not the primary bottleneck.

### CLI/dev startup path is slow

- `dotnet run --no-build --no-launch-profile --project apps/api/MainApi.csproj`: ~`16973ms`
- `dotnet build apps/api/MainApi.csproj -c Debug -p:OpenApiGenerateDocuments=false -clp:PerformanceSummary`: `14.51s`
  - Project evaluation: `~12.0s`
  - `BuildTranslationKeyGenerator`: `~1.4s`
  - `GenerateTranslationKeys`: `~103ms`

Interpretation: most delay is outside actual host boot, concentrated in build/evaluation/orchestration.

## 3) Git-history timeline tied to regression risk

### A. Build-time overhead increases (highest confidence for perceived regression)

1. `4f354e39` (2025-09-05)
- `MainApi.csproj` introduced both:
  - build-time OpenAPI document generation (`OpenApiGenerateDocuments=true`)
  - translation-key generation target before build

2. `68676845` (2025-11-11)
- Build pipeline changed to **build TranslationKeyGenerator project** before generating keys.
- Added recurring sub-build overhead each API build.

3. `a8863ed1` (2025-12-29)
- Upgrade to .NET 10.
- OpenAPI generation temporarily disabled in that commit.

4. `5da62292` (2025-12-30)
- OpenAPI generation re-enabled.
- Reintroduces build-time app execution/document generation cost.

### B. Startup-path logic additions (lower-to-medium impact)

5. `67bc410e` (2026-02-04)
- Added DI scanner/validator (`ServiceScanner`, `ServiceValidator`) and registration orchestration.
- This adds reflection and validation work at startup.
- Important correction: `ValidateOnBuild` was already present earlier (introduced in `a5fd12e6` on 2025-11-23), so Feb 4 is not the origin of that cost.

6. `57b02644` (2026-02-05)
- App config refactor to `AppEnvironment.Initialize()` with fail-fast env validation and dotenv resolution.
- Adds some synchronous startup work, but unlikely to explain multi-second regressions alone.

## 4) Services / entities / seeders growth analysis

### DbContext complexity growth (good proxy for model-build work)

`MainApiDbContext.cs` snapshot counts:

- `869b44fd` (2025-11-01): `DbSet=10`, `CheckConstraints=8`, `Indexes=3`
- `a1d52d78` (2026-01-10): `DbSet=14`, `CheckConstraints=14`, `Indexes=5`
- `74c353ef` (2026-01-14): `DbSet=13`, `CheckConstraints=14`, `Indexes=5`
- `HEAD`: `DbSet=13`, `CheckConstraints=15`, `Indexes=5`

Interpretation: schema/model complexity did increase, but incrementally.

### Seeder system

- Seeder architecture moved to distributed reflection-driven seeders in `869b44fd`.
- Current seeders under modules: 5 (`Permission`, `StaffProfile`, `Tenant`, `User`, `UserAccount`).
- Runtime note: no app startup call to `Database.Migrate()/EnsureCreated()` in production path (`rg` confirms only test fixtures use these), so seeding does **not** appear to be on the normal startup critical path.

### Service scanning scope

- `[Service]` attributed classes currently found: 3 (`AuditLogService`, `AuditLogQueryService`, `SystemNoticeService`).
- Reflection scan exists, but current attributed set is small.

## 5) Root-cause conclusion

Primary perceived startup regression is driven by **developer startup path overhead** (CLI + build pipeline), not by raw API host boot.

Most likely contributors, in order:

1. `dotnet run`/`dotnet watch` orchestration overhead vs direct executable startup
2. Build evaluation/restore costs repeatedly paid in dev loop
3. Translation key generator sub-build each API build
4. Build-time OpenAPI generation when enabled
5. Smaller additive startup work from DI scan/validation and env initialization

The growth in services/entities/seeders is real but does not, by itself, explain the largest latency jumps.

## 6) Concrete optimization plan

### Highest ROI (dev startup)

1. Use `--no-restore` in `dev-api` path.
- Why: restore/evaluation is a major chunk even when up-to-date.
- Example: `dotnet watch run --no-restore ...`

2. Disable build-time OpenAPI generation for dev watch/run loops.
- Keep generation in explicit workflows (`make generate-client` / CI).
- For `dotnet watch`, pass MSBuild property with `-property:OpenApiGenerateDocuments=false`.

3. Prefer direct apphost (`MainApi.exe`) for pure startup profiling.
- Separates app boot cost from CLI build/orchestration overhead.

### Build pipeline improvements

4. Make translation-key generation target fully incremental.
- Add `Inputs`/`Outputs` on target so MSBuild can skip target when unchanged.
- Avoid re-building the keygen project on every API build when unchanged.

5. Reduce always-on sub-build work.
- Build keygen once per session (or when keygen project changes), not every API build.

### Runtime startup path hardening (secondary)

6. Cache/share reflection results where practical.
- `ServiceScanner` and seeder discovery both rely on assembly type scans.

7. Gate heavy validation behavior by environment if desired.
- Keep strict checks in CI/development.
- Avoid unnecessary production startup tax where risk appetite allows.

8. Micro-optimize `AppEnvironment.Initialize()` only after measuring post-build optimizations.
- Current evidence suggests this is not primary.

## 7) Recommended verification sequence

1. Baseline with `MainApi.exe` and `dotnet run --no-build` (separate host vs CLI cost).
2. Baseline `dotnet watch run` current dev command.
3. Apply only `--no-restore`, re-measure.
4. Add `OpenApiGenerateDocuments=false` for watch, re-measure.
5. Make translation target incremental, re-measure.
6. Re-check if DI/env startup work still matters after build-path optimizations.

## 8) Bottom line

If your feeling is "API startup got slower over the past months," the evidence points to:

- true regression in **developer startup flow** (build/orchestration path), and
- comparatively stable/fast **actual API host boot**.

So the most effective fixes are build/dev-command optimizations first, then fine-tuning runtime initialization.