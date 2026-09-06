# Project-scoped design skills

Third-party frontend/design skill pack, vendored here so it is available to
anyone working in this repository via Claude Code.

## Provenance

Imported from a user-supplied archive (`tasteskills.zip`, `taste-skills/`).
These are **not** authored by the SkillSpector project and are unrelated to
SkillSpector's own shipped skill, which lives in `skills/skill-inspector/`.

Each directory is named after the `name` field in its `SKILL.md` frontmatter,
which may differ from the folder name used in the source archive
(e.g. `soft-skill` -> `high-end-visual-design`). `llms.txt` is the pack's
original index, preserved verbatim.

## Contents

| Skill | Source folder | Writes code? |
|---|---|---|
| `design-taste-frontend` | `taste-skill` | yes |
| `design-taste-frontend-v1` | `taste-skill-v1` | yes |
| `image-to-code` | `image-to-code-skill` | yes |
| `redesign-existing-projects` | `redesign-skill` | yes |
| `high-end-visual-design` | `soft-skill` | yes |
| `minimalist-ui` | `minimalist-skill` | yes |
| `industrial-brutalist-ui` | `brutalist-skill` | yes |
| `stitch-design-taste` | `stitch-skill` | generates `DESIGN.md` |
| `full-output-enforcement` | `output-skill` | output policy only |
| `imagegen-frontend-web` | `imagegen-frontend-web` | images only |
| `imagegen-frontend-mobile` | `imagegen-frontend-mobile` | images only |
| `brandkit` | `brandkit` | images only |

## Review status

Scanned before import for network exfiltration, credential access, and shell
payloads; none found. Every external URL is either design-system documentation
(Material, Fluent, Carbon, Polaris, Atlaskit) or a placeholder image service
(`picsum.photos`, `cdn.simpleicons.org`). All twelve `SKILL.md` files carry
valid frontmatter with `name` matching the directory.

This was a pre-import check, not a full SkillSpector run. To audit the pack
with the project's own tooling:

```
skillspector scan .claude/skills
```

## Note on duplicates

`brandkit`, `imagegen-frontend-web`, and `redesign-existing-projects` are also
distributed as claude.ai account-synced skills, byte-identical to these copies.
They are vendored anyway so the pack is complete and self-contained. If a
session loads both sources, remove these three directories to avoid a duplicate
skill name.
