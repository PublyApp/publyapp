; Unshipped analyzer release
; https://github.com/dotnet/roslyn-analyzers/blob/main/src/Microsoft.CodeAnalysis.Analyzers/ReleaseTrackingAnalyzers.Help.md
;
; NOTE: The "Severity" column below reflects each rule's `isEnabledByDefault` descriptor
; default — which is why every PUBLY rule reads "Disabled". This is intentional: all PUBLY
; rules ship dormant by default so they never break consumers that reference the analyzer
; package without opting in.
;
; Effective per-repo enforcement is configured in the repo-root .editorconfig via
; `dotnet_diagnostic.PUBLYxxxx.severity = warning`. Combined with
; `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` in Directory.Build.props, this turns
; each opted-in rule into a hard build error. Currently enforced as warnings:
;   PUBLY0001, PUBLY0002, PUBLY0003, PUBLY0004, PUBLY0005, PUBLY0006, PUBLY0007, PUBLY0008.

### New Rules

Rule ID | Category | Severity | Notes
--------|----------|----------|--------------------
PUBLY0001 | PublyApp.Nullability | Disabled | Avoid the null-forgiving operator
PUBLY0002 | PublyApp.Nullability | Disabled | Avoid null-coalescing throw expressions
PUBLY0003 | PublyApp.Comparison | Disabled | Avoid ToLower()/ToLowerInvariant() for comparison or dispatch
PUBLY0004 | PublyApp.Naming | Disabled | Avoid Dto suffix on handler contracts
PUBLY0005 | PublyApp.Validation | Disabled | Replace inline FluentValidation chains on JsonElement getters
PUBLY0006 | PublyApp.Correctness | Disabled | Avoid uncached request DTO getter calls
PUBLY0007 | PublyApp.Authorization | Disabled | Require ForStaff service variants in staff handlers
PUBLY0008 | PublyApp.Nullability | Disabled | Prefer is-null pattern checks over == / != with null
