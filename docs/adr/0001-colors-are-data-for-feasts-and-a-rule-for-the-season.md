---
status: accepted
---

# Colors are data for the exceptions and a rule for the rest

Every day of the calendar carries the color of its Mass. The rubrics give most
days their color by a rule — a feast is white, a vigil outside paschaltide is
violet, anything else wears its season's — and name the exceptions: the martyrs,
the apostles and evangelists, the feasts of the Cross and the Precious Blood,
Good Friday and All Souls. The calendar data (`assets/calendar1962.yml` and the
local propers) is written the same way: an entry names a `color` only where it
departs from the rule, and `src/seasons.ts` supplies the rule.

## Considered options

- **Every entry states its color.** No silent defaults, but some three hundred
  more annotations, the untitled ferias still need the season rule, and every
  local proper must annotate every saint.
- **Derive red from the title.** Most martyrs' slugs say `martyr` or
  `apostol`, but two dozen do not (`sabina`, `georgii`, `canuti`, `dorotheae`…)
  and local propers use Latin display titles, so an exception list is needed
  either way.

## Consequences

- A martyr whose entry forgets `color: red` comes out white. A test guards this:
  every base-calendar title that says martyr, apostle or evangelist must be red
  unless it is on a short, named white list.
- A local proper is white unless it says otherwise; its martyrs must be marked.
