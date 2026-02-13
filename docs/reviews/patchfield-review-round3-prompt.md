# Round 3: Addressing Your Round 2 Findings

Hey — we addressed all four of your "ship with fixes" items from round 2, plus did some cleanup. Here's what changed and why. This should be the final pass unless you find something new.

---

## What we did

### 1. Strict ISO date parsing — your top blocking item

You were right that `DateTimeOffset.TryParse` with `InvariantCulture` is still permissive — it accepts formats like `06/15/2026 10:00 AM` while our error messages promise ISO 8601.

**Fix:** Created a centralized `DateUtils.TryParseIsoUtc` utility using `TryParseExact`:

```csharp
// apps/api/Src/Lib/Utils/DateUtils.cs
public static class DateUtils {
    private static readonly string[] IsoFormats =
        ["O", "yyyy-MM-ddTHH:mm:ss.FFFFFFFK"];

    public static bool TryParseIsoUtc(
        string? raw, out DateTime utc
    ) {
        utc = default;
        if (string.IsNullOrWhiteSpace(raw)) {
            return false;
        }

        var ok = DateTimeOffset.TryParseExact(
            raw,
            IsoFormats,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal
                | DateTimeStyles.AdjustToUniversal,
            out var dto
        );

        if (!ok) {
            return false;
        }
        utc = dto.UtcDateTime;
        return true;
    }
}
```

This is now the **single source of truth** for date parsing — used by:
- `JsonElementExtensions.cs` (extraction methods: `GetValueAsDateTime`, `GetValueAsDateTimeOrNull`, `ParseDateTimeUtcOrThrow`)
- `CreateSystemNotice.cs` validators (`BeValidDateTime`, `BeValidDateTimeOrNull`)
- `UpdateSystemNotice.cs` validators (`BeValidDateTimeOrNull`, `BeValidDateTimeOrUndefined`)

No more drift between validator and extraction behavior — both call `DateUtils.TryParseIsoUtc`.

**Files:** `apps/api/Src/Lib/Utils/DateUtils.cs` (NEW), `apps/api/Src/Lib/Extensions/JsonElementExtensions.cs`, `CreateSystemNotice.cs`, `UpdateSystemNotice.cs`

### 2. Two ExpiresAt tri-state integration tests — your second blocking item

Added both tests you asked for:

**`Update_OmittedExpiresAt_PreservesExistingValue`** — Creates a notice with an expiresAt, PATCHes only the title (no expiresAt in body), then verifies expiresAt is unchanged via GET.

**`Update_SetExpiresAt_UpdatesValue`** — Creates a notice without expiresAt, PATCHes with a new expiresAt string, verifies the response has the new value (using `BeCloseTo` with 1-second tolerance for UTC rounding).

Together with the existing `Update_ClearExpiresAt_SetsToNull`, the full tri-state matrix is covered: omit → preserve, null → clear, value → set.

**Files:** `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.IntegrationTests.cs`

### 3. Architecture test banning PatchField in wire DTOs — your follow-up item #1

Added a reflection-based test that scans all types in `Handlers` namespaces with suffixes `Body`, `Query`, `Created`, `Updated`, `Deleted`, `Response` — and fails if any property uses `PatchField<>`.

This automates the "never use PatchField in wire DTOs" rule so it can't regress silently.

```csharp
// apps/api/Src/Lib/Testing/ArchitectureGuardTests.cs
public sealed class ArchitectureGuardTests {
    [Fact]
    public void HttpDtos_MustNotUsePatchField() {
        var apiAssembly = typeof(Program).Assembly;

        var dtoTypes = apiAssembly.GetTypes()
            .Where(t => t.Namespace?.Contains("Handlers") == true)
            .Where(t => t.Name.EndsWith("Body")
                || t.Name.EndsWith("Query")
                || t.Name.EndsWith("Created")
                || t.Name.EndsWith("Updated")
                || t.Name.EndsWith("Deleted")
                || t.Name.EndsWith("Response"));

        var offenders = dtoTypes
            .SelectMany(t => t.GetProperties().Select(p => (Type: t, Prop: p)))
            .Where(x => x.Prop.PropertyType.IsGenericType)
            .Where(x => x.Prop.PropertyType.GetGenericTypeDefinition() == typeof(PatchField<>))
            .Select(x => $"{x.Type.Name}.{x.Prop.Name}")
            .ToList();

        offenders.Should().BeEmpty(
            "PatchField<T> must not appear in HTTP wire DTOs. "
            + "Use it only in service args records."
        );
    }
}
```

Note: this lives in `Src/Lib/Testing/` (not `*.IntegrationTests.cs`) because it's a unit-level architecture test — no DB, no HTTP, just reflection. The test project compiles `Testing/**/*.cs` so it runs alongside everything else.

**Files:** `apps/api/Src/Lib/Testing/ArchitectureGuardTests.cs` (NEW)

### 4. Null guards on PatchField.Match delegates — your follow-up item #3

Added `ArgumentNullException.ThrowIfNull` for both delegates:

```csharp
public TResult Match<TResult>(
    Func<T?, TResult> onPresent,
    Func<TResult> onAbsent
) {
    ArgumentNullException.ThrowIfNull(onPresent);
    ArgumentNullException.ThrowIfNull(onAbsent);
    return IsPresent
        ? onPresent(_value)
        : onAbsent();
}
```

**Files:** `apps/api/Src/Lib/PatchField.cs`

---

## Additional cleanup (not from your review)

### 5. Bracketless `if` statements → always use braces

We noticed inconsistency in control flow formatting. Added a code standard rule and fixed all offending instances in the changed files:

- `CreateSystemNotice.cs` — 4 instances in validator methods
- `UpdateSystemNotice.cs` — 6 instances in validator methods
- `DateUtils.cs` — 1 instance
- `SystemNoticeService.cs` — 3 instances in lambda expressions

New AGENTS.md rule:
> Always use braces on `if`/`else`/`for`/`foreach`/`while` blocks. Single-statement bodies are not exempt.

### 6. Renamed DateParsing → DateUtils, moved to Lib/Utils

Originally created as `Src/Lib/DateParsing.cs`. Renamed to `DateUtils` and moved to `Src/Lib/Utils/DateUtils.cs` for consistency with the existing `Lib/Utils/` directory (which already has `PathUtils` etc.).

---

## Current state

- `dotnet build`: 0 errors, 0 warnings
- `dotnet test --filter SystemNotices`: 27/27 pass (25 original + 2 new tri-state tests)
- `dotnet test --filter ArchitectureGuard`: 1/1 pass
- Total: 28/28

## Files changed since round 2

| File | What changed |
|------|-------------|
| `apps/api/Src/Lib/Utils/DateUtils.cs` | NEW — centralized strict ISO 8601 parser with `TryParseExact` |
| `apps/api/Src/Lib/Extensions/JsonElementExtensions.cs` | Uses `DateUtils.TryParseIsoUtc` instead of inline `TryParse` |
| `apps/api/Src/Lib/PatchField.cs` | `Match` now has `ArgumentNullException.ThrowIfNull` on both delegates |
| `apps/api/Src/Lib/Testing/ArchitectureGuardTests.cs` | NEW — reflection test banning `PatchField<>` in wire DTOs |
| `apps/api/Src/Modules/SystemNotices/Handlers/Staff/CreateSystemNotice.cs` | Validators use `DateUtils.TryParseIsoUtc`, all `if` blocks have braces |
| `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs` | Validators use `DateUtils.TryParseIsoUtc`, all `if` blocks have braces |
| `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.IntegrationTests.cs` | +2 new tri-state tests (omit preserves, set updates) |
| `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs` | Bracketless `if` fixes in lambda expressions |
| `AGENTS.md` | Added "always use braces" code formatting rule |

---

## What I want you to review

1. **Is `DateUtils.TryParseIsoUtc` correct and complete?** Are the two formats (`"O"` and `"yyyy-MM-ddTHH:mm:ss.FFFFFFFK"`) sufficient for what clients will send? Any edge cases (e.g., `2026-02-12T10:00:00` without timezone designator — should that be accepted or rejected)?
2. **Are the two new integration tests solid?** Do they cover the tri-state matrix adequately, or is there a fourth case we're missing?
3. **Is the architecture guard test robust enough?** The suffix list (`Body`, `Query`, `Created`, `Updated`, `Deleted`, `Response`) — are we missing any DTO naming patterns that should be guarded?
4. **Anything else?** New issues, missed edge cases, or final nits before we merge?

Write your review as a Markdown file I can save as `patchfield-review-round3-output.md`. Same structure as before. If the verdict is "ship it" with no blocking items, keep it short — we don't need lengthy prose on things that are fine.
