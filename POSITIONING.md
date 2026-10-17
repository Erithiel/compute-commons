# Positioning: a people's, non-profit project

> Draft, 2026-10-17. How we describe ourselves in the pitch, README and demo. Companion to `IDEA.md` and `security/SECURITY.md`.

## One line

**Spare AI, shared for everyone.** People pool the AI capacity they are not using to build software that belongs to the public, not to a few big companies.

Alternatives to test: "Software built by people, for people." / "Your unused AI, put to work for the commons."

## The simple version

Millions of people already pay AI companies every month, and most use only part of what they pay for (no published figure for unused capacity as of 2026-10-17; when Anthropic introduced weekly limits in 2025 it said they would affect less than 5% of users, so most people never reach their cap, see `SOURCES.md` S1; add our own survey number if we collect one). That unused part is lost when the limit resets. Instead of letting it expire, anyone can start the skill when they are not using their AI, pick a cleared task from their clan, and spend the leftover on software that helps everyone. They keep paying what they already pay. Nothing extra, nothing automated.

## Vision

AI is making software cheaper to produce, which could concentrate power in the few who own the compute and the platforms. We are building a **commons**: people share what they have, and what they make stays open.

**We use the tools that exist today, and we want the result to belong to everyone.**

We are honest about it: we run on the AI products people already pay for. The aim is that the output (code, rules, credit) is open and shared, and that the project can move to open models as they mature.

Roots we draw on: open source, Wikipedia, and the commons tradition (communities managing shared resources well). Inspired by the spirit of shared abundance, not tied to any single blueprint.

Avoid in the pitch: predictions that AI "will crash humanity" or that big companies will "own 99% of software". We argue for a commons without needing to win that debate.

## Mission

We believe the software people depend on should be decided and owned by people, not only by the few companies that can afford the most AI. Many of us already pay for AI and leave half of it unused. Together that is a large, wasted resource. We turn it into real work on open-source and public-interest software, voluntarily, with no profit motive.

## The story (30 seconds)

AI is concentrating power. A handful of companies decide what gets built, then claim it as theirs. But ordinary people also hold AI capacity, and most of it goes unused every month. Join a clan, pick a task from a project that matters, work on it with your own AI, and a human maintainer reviews it. No money changes hands. The software stays open. The credit goes to the people who made it.

## Principles

1. **Non-profit in spirit and, when we are ready, in form.** No ads, no selling data, no paid tiers, no investors who can steer it.
2. **Everything stays open.** The tool, the clan rules and the work all use open licences, so nobody can enclose them later.
3. **People decide.** Transparent governance, public rules, public audit log. Clans choose their own projects.
4. **Human in the loop.** A person starts every session and reviews every result. Nothing is automated behind anyone's back.
5. **Safe by design.** Trust is earned, security roles are separate, and cleared tasks only (see `security/SECURITY.md`).
6. **Credit to people.** Contributors are named and recognised; accepted work is what counts.
7. **Welcome ideas, not only code.** Anyone with an idea can propose it. Clans turn good ideas into tasks.

## Who it is for

- **People with spare AI capacity** who want it to do something good.
- **People with ideas but no team or budget** (students, community groups, local initiatives).
- **Maintainers** of public-good open-source projects who need extra hands.
- **Small organisations** (schools, NGOs, civic tech) that cannot hire developers.

## What this changes in the design

| Positioning | Design consequence |
|---|---|
| Ideas from anyone | Add an **idea board**: anyone proposes an idea; a clan triages it into a project and tasks. v1 stays on existing issues; show the idea board as the next step. |
| Everything open | License the tool (decision needed: MIT/Apache vs AGPL), require open licences on supported projects. |
| No profit | No payments in the product. Funding, if any, via grants or donations through a fiscal host, never paid features. |
| People decide | Clan governance rules are public; `clan.yml` changes need review; audit log is public. |
| Credit to people | Contributor pages, "what we built together" summaries, clan impact stats. |

## Tone

Warm, plain, serious about trust. Not anti-technology and not "against companies"; companies can use open software too. We are for **shared ownership**. Avoid hype words ("revolution", "disrupt").

## Be careful with claims

- Do not say we are a registered non-profit until we are. Say "non-profit project" or "community project" and explain the plan.
- Do not imply endorsement by Anthropic or any other AI provider.
- Do not promise rewards or money.
- Say what is built today versus the roadmap.

## Name ideas (check availability, domains and trademarks first)

Compute Commons (working title), Common Hands, Spare Hands, Commons Guild, Shared Cycles. Note that "OpenHands" is already an existing AI-agent project, so avoid it.

## Open questions

1. Licence for the tool: permissive (MIT/Apache) or share-alike (AGPL)?
2. Legal form when we grow: fiscal host under an existing foundation, or our own non-profit?
3. Governance: who decides the "public good" rules and how are disputes handled?
4. How broad is "ideas from anyone", and who triages them at the start?
5. Do we say "non-profit" in the hackathon pitch, or "community, non-profit by design"?
