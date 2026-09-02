# README Open-Core Revamp Design

**Date:** 2026-09-02  
**Status:** Approved; implementation in review

## Purpose

Turn the root README into an accurate, welcoming landing page for PublyApp's
open-source core. It should quickly explain the product, distinguish what ships
today from the product direction, help a new contributor start locally, and
state the licensing model without contradiction.

The README is an entry point, not a second copy of the repository's detailed
guides. Operational and architectural procedures stay in their authoritative
documents and are linked from the README.

## Audience and Positioning

The primary audience is a developer, contributor, or technical evaluator
discovering the repository. The opening should answer four questions in order:

1. What is PublyApp?
2. What can the open core do today?
3. How can I run it locally?
4. Where do I learn more or contribute?

PublyApp is presented as an Apache-2.0 open-core, multi-tenant SaaS foundation
for social-content operations. Separately distributed paid modules are not
part of this repository and are not covered by its Apache-2.0 licence. The
README must not imply that this repository itself is proprietary.

## Proposed Structure

1. **Hero and short value proposition**
   - Reuse the existing PublyApp mark.
   - Keep a compact, useful badge row, including Apache-2.0.
   - Replace broad promises with a plain-language description of the open core.
2. **What ships today**
   - Summarize the concrete platform capabilities present in the repository:
     tenancy, authentication and permissions, users and invitations, staff and
     tenant surfaces, post drafting and publishing, social accounts,
     auditability, generated API client, and deployment topology.
   - Distinguish the working post/publishing pipeline from the richer calendar,
     queue, multi-network, and review experience that remains product direction.
3. **Quick start**
   - Move the shortest supported local path near the top.
   - State prerequisites and use the repository's canonical commands.
   - Link to detailed setup and environment guidance instead of duplicating it.
4. **Architecture at a glance**
   - Retain one compact diagram and a short monorepo map.
   - Use the current `X-Tenant-Id` contract and current application topology.
   - Link to architecture guides for deeper rules.
5. **Development and quality**
   - Keep only the commands a newcomer is likely to need.
   - Describe local and hosted CI accurately; do not repeat obsolete claims
     that API tests only run locally.
   - Link to `AGENTS.md` and focused guides for full conventions.
6. **Contributing**
   - Explain the contribution path and point to the CLA.
   - Keep agent instructions discoverable without making them dominate the
     human-facing README.
7. **Deployment and project status**
   - Give a concise topology summary and link to the maintained runbooks.
   - Preserve only status claims that can be verified from repository records.
8. **Licence and open-core boundary**
   - State that this repository is licensed under Apache-2.0.
   - Link directly to `LICENSE`, `NOTICE`, and `CLA.md`.
   - Explain in one short paragraph that separately distributed paid modules
     remain closed source and fall outside this repository's licence.

## Truth Sources

Implementation must reconcile every factual claim against the repository's
current authoritative sources:

- `LICENSE`, `NOTICE`, and `CLA.md` for licensing and the open-core boundary;
- root and workspace manifests for version and licence metadata;
- `AGENTS.md` and its linked guides for supported commands, architecture,
  headers, application layout, and CI behavior;
- `dokploy.yml` and deployment runbooks for deployment topology;
- source and tests for claims about capabilities that ship today.

If a claim cannot be verified, it is removed, narrowed, or explicitly framed
as direction rather than current functionality.

## Content and Visual Constraints

- Reuse the existing logo; no new image asset is needed.
- Prefer short prose, small tables, and one architecture diagram.
- Avoid decorative badge overload and repeated command reference sections.
- Keep GitHub-compatible Markdown and useful anchor links.
- Do not introduce a new documentation guard, baseline, manifest, or other
  maintenance mechanism solely for this rewrite.
- Do not modify product code, runtime behavior, licensing documents, or the
  legal meaning of the existing Apache-2.0/CLA arrangement.

## Verification

Before proposing the README change:

- compare its licensing language with `LICENSE`, `NOTICE`, and `CLA.md`;
- verify commands and technical names against current repository sources;
- run the repository documentation-link gate;
- run formatting or Markdown checks that already exist;
- inspect the rendered structure for broken anchors, excessive length, and
  misleading hierarchy;
- obtain an adverse review from a different model family before merge.

## Success Criteria

A new technical reader should understand PublyApp's value, delivered scope,
local startup path, architecture, contribution path, and licence in a few
minutes. No statement should contradict the repository's authoritative
licensing, API, CI, or deployment documentation, and detailed procedures
should remain owned by their existing guides.
