# Round 2: PatchField Fixes — Review What We Changed

Hey — thanks for the first review. You were right on most things, wrong on one thing you thought you were right about (and we'll get to that), and we went further than your recommendations on a couple of points. Here's the full rundown of what we did, where we agreed, where we pushed back, and why. Please review the updated code and tell us if we missed anything or introduced new issues.

---

## What you got right (and we fixed)

### 1. `JsonElement?` can't distinguish absent from null — your Critical #1

You were 100% right. We initially pushed back because in *theory* `JsonElement?` should work (non-nullable `JsonElement` gets `Undefined` for omitted, nullable `JsonElement?` gets C# `null` for omitted). But when we ran the actual test, `Update_ClearExpiresAt_SetsToNull` failed exactly as you predicted.

The root cause: System.Text.Json deserializes JSON `null` into a `JsonElement?` as C# `null` (the `Nullable<JsonElement>` has no value). So both "omitted" and "explicit null" produce `ExpiresAt == null` in C#. The `GetExpiresAt()` method hit `if (ExpiresAt is null) → return Absent()` for both cases, meaning `{"expiresAt": null}` was silently treated as "don't change."

**Fix:** Changed `ExpiresAt` from `JsonElement?` to non-nullable `JsonElement` in `UpdateSystemNoticeBody`. The getter now uses a `ValueKind` switch:

```csharp
public JsonElement ExpiresAt { get; init; }

public PatchField<DateTime?> GetExpiresAt() =>
    ExpiresAt.ValueKind switch {
        JsonValueKind.Undefined => PatchField<DateTime?>.Absent(),
        JsonValueKind.Null => PatchField<DateTime?>.Set(null),
        JsonValueKind.String => PatchField<DateTime?>.Set(ExpiresAt.GetValueAsDateTime()),
        _ => throw new InvalidOperationException("ExpiresAt must be an ISO 8601 string, null, or omitted"),
    };
```

Updated the validator too — new `BeValidDateTimeOrUndefined(JsonElement)` method that handles the non-nullable element. Test passes now.

**Files:** `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`

### 2. Silent `?? NoticeSeverity.Info` fallback — your Warning #2

Agreed. FluentValidation guarantees the severity is valid before the handler runs. If `ParseSeverity()` returns null after validation passed, that's a logic bug — silently defaulting to `Info` hides it.

**Fix:** Both Create and Update handlers now throw:

```csharp
var severity = SystemNotice.ParseSeverity(severityStr)
    ?? throw new InvalidOperationException(
        $"Severity parser rejected validated value '{severityStr}'."
    );
```

**Files:** `apps/api/Src/Modules/SystemNotices/Handlers/Staff/CreateSystemNotice.cs`, `UpdateSystemNotice.cs`

### 3. `GetExpiresAt()` silent `Absent()` on unexpected kinds — your Warning #3

Fixed by the `ValueKind` switch above. The `_ =>` arm now throws instead of silently returning `Absent()`.

### 4. DateTime parsing culture-sensitivity — your Warning in Areas 3 & 5

Agreed. `DateTime.Parse(str).ToUniversalTime()` uses server locale. We replaced all DateTime parsing in `JsonElementExtensions.cs` with:

```csharp
DateTimeOffset.TryParse(
    raw,
    CultureInfo.InvariantCulture,
    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
    out var dto
)
```

Centralized the logic into a private `ParseDateTimeUtc` helper used by both `GetValueAsDateTime` and `GetValueAsDateTimeOrNull` overloads. Also updated all validator `TryParse` calls in both Create and Update handlers to use the same invariant pattern.

**Files:** `apps/api/Src/Lib/Extensions/JsonElementExtensions.cs`, `CreateSystemNotice.cs`, `UpdateSystemNotice.cs`

### 5. AGENTS.md documented wrong pattern — your Critical in Area 6

Fixed. The PatchField section now shows `JsonElement` (non-nullable) for clearable fields, not `JsonElement?`. Updated all code examples, the cross-references in the DTO patterns section, and the Service Layer section.

### 6. `if` vs `?? throw` rule contradiction — your Nit in Area 5

You were right that the rule was over-prescriptive and already contradicted by `DeleteSystemNotice.cs:24`. We softened it from "must use `if`" to "prefer `if` for multi-line guards, both patterns acceptable." `DeleteSystemNotice.cs` stays as-is — it's now consistent with the softened rule.

**Files:** `AGENTS.md`

---

## Where we went further than your recommendations

### 7. Service args records (your Nit about long-parameter signatures)

You flagged the long-parameter service signature as a nit and suggested a command object as a follow-up. We liked the idea and promoted it to a first-class pattern:

- Created `CreateSystemNoticeArgs` and `UpdateSystemNoticeArgs` records in the service file
- Updated `ISystemNoticeService` and `SystemNoticeService` to use them
- Handlers now construct the args inline: `new CreateSystemNoticeArgs(Severity: ..., Title: body.GetTitle(), ...)`
- Added a formal **"Service Method Args Records"** rule in AGENTS.md: use args records when 3+ domain parameters, naming convention `{Action}{Domain}Args`, placement in service file, `id` stays separate

**Files:** `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`, `CreateSystemNotice.cs`, `UpdateSystemNotice.cs`, `AGENTS.md`

### 8. Hardened `PatchField<T>` API (your Warning about `.Value` returning default)

You suggested `.Value` should throw when absent and we should add `TryGetValue`. We did both, plus added `Match`:

```csharp
public readonly struct PatchField<T> {
    private readonly T? _value;
    public bool IsPresent { get; }

    public T? Value => IsPresent
        ? _value
        : throw new InvalidOperationException(
            "Cannot access Value on an absent PatchField. Check IsPresent first."
        );

    public bool TryGetValue(out T? value) {
        value = _value;
        return IsPresent;
    }

    public TResult Match<TResult>(
        Func<T?, TResult> onPresent,
        Func<TResult> onAbsent
    ) => IsPresent ? onPresent(_value) : onAbsent();
}
```

Verified all existing `.Value` accesses are guarded by `.IsPresent` checks — no callers broke.

**Files:** `apps/api/Src/Lib/PatchField.cs`

### 9. Split AGENTS.md PatchField section (your Warning about length)

You said the PatchField section was too long for a policy file. Agreed — we split it:

- **`docs/guides/patchfield-pattern.md`** — Full guide (~200 lines): problem statement, API surface table, decision tree, all three layers with examples, anti-patterns, validator pattern, type examples, reference files
- **AGENTS.md** — Trimmed to a 7-point checklist + one quick-reference code block + link to the guide

---

## Where we pushed back

### PatchField\<T\> should be `internal` — your Warning in Area 2

You suggested making `PatchField<T>` internal to prevent it leaking into HTTP DTOs. We kept it `public` because:

- The integration test project is a **separate assembly** — making it `internal` would break test compilation unless we add `[InternalsVisibleTo]`, which leaks internal surface to tests anyway
- The real mitigation is documentation, not access modifiers — AGENTS.md already says "never use in wire DTOs" and the guide reinforces this
- `PatchField<T>` is never used in response DTOs or anywhere that touches OpenAPI generation

If you still disagree, what's your concrete attack vector? A future dev accidentally putting `PatchField<DateTime?>` as a response DTO property? That would fail at OpenAPI generation time and be caught immediately.

### Mapper class — your Warning in Area 4

You suggested a separate `UpdateSystemNoticeMapper` class to convert the body DTO into a typed input. We went with inline args construction instead:

```csharp
var args = new UpdateSystemNoticeArgs(
    Severity: severity,
    Title: body.GetTitle(),
    ...
);
```

Why: a separate mapper class adds a file/class for what is 6 lines of named-parameter construction. The args record *is* the typed input — the handler constructing it inline *is* the mapping. A mapper class would make sense if multiple callers needed to construct the same args (e.g., bulk update, import), but right now there's exactly one caller per args type.

---

## Current state

- `dotnet build`: 0 errors, 0 warnings
- `dotnet test --filter SystemNotices`: 25/25 pass (including `Update_ClearExpiresAt_SetsToNull`)

## Files changed since your review

| File | What changed |
|------|-------------|
| `apps/api/Src/Lib/PatchField.cs` | `Value` throws when absent, added `TryGetValue`, `Match` |
| `apps/api/Src/Lib/Extensions/JsonElementExtensions.cs` | Invariant culture DateTime parsing, centralized `ParseDateTimeUtc` helper |
| `apps/api/Src/Modules/SystemNotices/Handlers/Staff/CreateSystemNotice.cs` | `?? Info` → `?? throw`, invariant culture validators, args record construction |
| `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs` | `JsonElement?` → `JsonElement` for ExpiresAt, `ValueKind` switch, `?? throw` for severity, invariant culture validators, args record construction |
| `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs` | Added `CreateSystemNoticeArgs` + `UpdateSystemNoticeArgs` records, updated interface + impl |
| `AGENTS.md` | Softened `if` vs `?? throw` rule, added args records rule, trimmed PatchField section to checklist + link, updated severity example, fixed all cross-references |
| `docs/guides/patchfield-pattern.md` | NEW — full PatchField guide extracted from AGENTS.md |

---

## What I want you to review

1. **Did we fix the `JsonElement?` → `JsonElement` correctly?** Any edge cases we missed in the `ValueKind` switch or the validator?
2. **Is the `DateTimeOffset.TryParse` with invariant culture the right fix?** Or should we go stricter (e.g., `TryParseExact` with `"O"` format)?
3. **Are the args records well-designed?** Naming, placement, the decision to keep `id` separate — any issues?
4. **Is the hardened `PatchField<T>` API complete?** Should `Match` have a `void` overload? Should we add `Map`/`Bind`? Or is the current surface sufficient?
5. **Do you still think `PatchField<T>` should be `internal`?** If so, how do you handle the test project?
6. **Anything else we missed?** New issues introduced by these changes?

Write your review as a Markdown file I can save as `patchfield-review-round2-output.md`. Same structure as last time: findings by area, severity ratings, code examples for any recommendations, overall verdict.
