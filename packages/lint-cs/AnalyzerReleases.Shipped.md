; Shipped analyzer releases
; https://github.com/dotnet/roslyn-analyzers/blob/main/src/Microsoft.CodeAnalysis.Analyzers/ReleaseTrackingAnalyzers.Help.md
;
; NOTE: All PUBLY rules intentionally remain in AnalyzerReleases.Unshipped.md and are NOT
; migrated here, even though they are enforced in this repo. This is deliberate policy:
;
;   1. This analyzer package is consumed in-repo only and is never versioned or published
;      externally, so there is no release boundary to promote across. Keeping all rules in
;      Unshipped.md is a LOCAL repo convention — not a Roslyn constraint. (Roslyn's release-
;      tracking format does allow "Disabled" entries in Shipped.md; the choice to keep them
;      in Unshipped.md is intentional to signal that no external release has ever shipped.)
;
;   2. Effective per-repo enforcement is driven entirely by .editorconfig severities:
;        dotnet_diagnostic.PUBLYxxxx.severity = warning
;      Combined with <TreatWarningsAsErrors>true</TreatWarningsAsErrors> in
;      Directory.Build.props, this turns each opted-in rule into a hard build error.
;      Currently every shipped PUBLY rule is enforced this way (see the list in
;      AnalyzerReleases.Unshipped.md).
;
;   3. The Roslyn release-tracking analyzer treats "Disabled" (isEnabledByDefault: false)
;      as the correct steady-state for this package. The "Disabled" entries in
;      AnalyzerReleases.Unshipped.md are NOT a sign that rules are missing or broken —
;      see the explanatory NOTE at the top of that file for details.
;
; In short: do NOT move PUBLY rule rows here. Enforcement is an .editorconfig concern,
; not a release-promotion concern.
