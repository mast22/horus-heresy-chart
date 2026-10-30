# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two co-equal audiences:

- New readers partway through the series who need the next safe book without spoiling later arcs.
- Experienced readers filling gaps in short stories, novellas, and side arcs.

Both arrive to find their place in the series and choose what to read next without encountering later-series spoilers.

## Product Purpose

An interactive web transcription of the Black Librarium Horus Heresy reading-order flow chart (V3.0, 2021), adding web affordances such as search, next-work routing, and per-book details. It exists to make the series navigable and spoiler-safe at the reader's own pace. Success means a reader can locate where they are, see what to read next, and understand why, without being spoiled.

## Positioning

A faithful transcription of a community-built, spoiler-free reading order presented as an interactive graph. It is not a publisher-number list and not a chronological history; the curated link graph and its spoiler rationale are the product. A neighboring product could copy the book list but not truthfully copy the community's spoiler-safe connections.

## Operating Context

Readers consult the chart while choosing their next title, often mid-series, on desktop and mobile browsers. The chart mirrors the printed poster's node positions; works connect through primary, secondary, and tertiary links; shortcut nodes stand for the works they represent. Supporting pages explain how to use the chart, credit the original creators, and describe the project.

## Capabilities and Constraints

- Covers all currently available Horus Heresy main-series and Siege of Terra novels and short stories, plus selected Primarchs and Characters Series works that take place during the Heresy and aid understanding.
- Interactive graph with search, next-work routing, faction/legion colors, era bands (Horus Heresy and Siege of Terra), a work-detail panel, and light/dark themes.
- Faithful interactive transcription: preserve the poster's order, layout, and credits; web affordances serve that order rather than replace it.
- Chart data is transcribed from `sources/chart.png`; positions are approximate poster pixels.
- Scope is the chart plus its reference pages (how to use, credit, about). Personal reading-progress tracking is out of scope.
- Per-book details (author, year, length, description) are curated editorial summaries and must remain spoiler-free.
- Media labels follow a title's widest distribution format; audio-first stories later collected in print appear as short stories.
- Undecided: what the currently empty About page should contain.

## Brand Commitments

Site name: Horus Heresy Order Flow Chart. The project is fanmade and neither affiliated with nor endorsed by Black Library or Games Workshop. The Games Workshop trademark disclaimer and the Black Librarium credits (Nico., Eloniel Castana, Sammael El'Jacson, and the listed acknowledgments) must be preserved.

## Evidence on Hand

- `sources/chart.png` — original Black Librarium poster (V3.0, 27/05/2021).
- `src/flow/chart.ts` — chart body transcribed from the poster.
- `src/flow/work-details.ts` — curated bibliographic and description data.
- `src/copy/credit.md` and `src/copy/how-to-use-this-chart.md` — source copy.
- No testimonials, traffic data, press, or third-party endorsements exist; future work must not fabricate them.

## Product Principles

1. Spoiler safety outranks chronological and publication order.
2. Fidelity to the source poster: same order, connections, and credits; web features serve the chart, not replace it.
3. Serve newcomers and veterans equally; neither audience is a secondary mode.
4. Never invent works, links, or bibliographic facts.
5. The chart stays central; reference pages support it.
