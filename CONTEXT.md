# Liturgical Calendar

Generates the Catholic liturgical calendar of a year under the 1960 Code of
Rubrics (the 1962 Missal): which celebration each day keeps, what it is
commemorated with, which season it falls in and which color its Mass wears.

## Language

Liturgical identifiers — the types of day, the seasons, the titles of
celebrations — are Latin, in the words the rubrics use, written as lowercase
hyphenated slugs. Colors are plain English: they name what a reader shows, not a
rite.

**Season**:
One of the ten stretches the rubrics divide the year into (nn. 71–78), named by
its Latin genitive as in *tempus Adventus*: `adventus`, `nativitatis`,
`epiphaniae`, `per-annum`, `septuagesimae`, `quadragesimae`, `passionis`,
`paschatis`, `ascensionis`, `pentecostes`.
_Avoid_: tide, period, "ordinary time" (a 1969 term)

**Color**:
The color of the vestments a Mass is said in (nn. 117–134): `white`, `red`,
`green`, `violet`, `rose` or `black`.
_Avoid_: albus/ruber and the other Latin names, colour, hue

**Alternative Color**:
A color the rubrics permit in place of the prescribed one: rose on Gaudete and
Laetare Sunday (n. 127), and nowhere else. The prescribed color stays violet.
_Avoid_: optional color, secondary color

**Name**:
What a language calls a thing the calendar identifies: the Dutch "Advent" for
the season `adventus`, "paars" for the color `violet`, a translated title for a
slug. A language supplies names; it never changes an identifier.
_Avoid_: label, translation (of an identifier)

**Martyrology**:
The *Martyrologium Romanum*, read at Prime: for each date its date line in the
Roman reckoning, the age of the moon, and the **Elogia**. The Martyrology of a
date is read on the day before it; a day carries the reading of its own date.
_Avoid_: martyrologium as an English word, saints of the day

**Elogium**:
One entry of the Martyrology: where, and how, a saint was born into heaven.
_Avoid_: entry (in prose about the rite), notice, bio

**Movable Announcement**:
What the Martyrology reads before the elogia on a movable day — Septuagesima,
Easter, Christ the King — keyed to the date it is read before.
_Avoid_: movable feast (the announcement is of a day, not always a feast)

**Office**:
The *Officium divinum* of the Breviary: the Hours a day prays — first Vespers
on the evening before, Matins, Lauds, Prime, Terce, Sext, None, Vespers. What
the calendar gives a day of it is its **propers**: the texts the day says of its
own or takes from its common — hymns, antiphons, lessons, responsories,
chapters, versicles — not the Hours assembled.
_Avoid_: breviary (for the texts of a day), divine office in lowercase, liturgy of the hours (a 1971 term)

**Local Proper**:
The calendar of a diocese, region, church or congregation, filling the slots
the base calendar leaves for it; it names the color of its own days and is
white where it says nothing.
_Avoid_: diocesan calendar, supplement

## Relationships

- Every **Liturgical Day** falls in exactly one **Season**; the season belongs to
  the date, not to the celebration kept on it.
- A day belongs to the season of its office. A vigil Mass that opens the next
  season does not move the day: the Vigil of Pentecost is in `ascensionis` and
  Holy Saturday in `passionis`, whatever their Mass that evening wears.
- Where the rubrics leave a day between seasons, it takes the season of the
  Sunday or feria under it: Trinity Sunday, kept on the First Sunday after
  Pentecost, is in `per-annum`.
- Every **Liturgical Day** wears exactly one **Color**, that of the Mass said.
  A **Commemoration** wears none: it is a collect added to that Mass, not a
  Mass of its own. Only when a rubric lets a commemorated celebration be taken
  as the Mass — a votive Mass, say — does it have a color, and that is the color
  of that Mass, not of the commemoration.
- A feast of the Lord kept on a Sunday by its own date (n. 17: the Holy Name,
  the Holy Family, the Trinity, Christ the King) takes the place of the Sunday
  and commemorates no Sunday. A feast that merely falls on a Sunday, such as
  All Saints, commemorates it. Either way, the ferias of that week say the
  Sunday's own Mass.
- A **Color** comes from the day's entry in the calendar data where that names
  one, and otherwise from the rubrics' rule: a feast is white, a vigil outside
  paschaltide is violet, any other day wears its **Season**'s. The data names
  only the exceptions (see ADR 0001).
- A **Season** and a **Color** are identifiers and are never translated; each
  language, Latin included, gives them a **Name** beside the identifier. A
  **Title** is already a name and is translated in place.

## Boundaries

- The calendar states what the rubrics prescribe for a day: its celebration,
  its commemorations, its season and the color of its Mass. The Masses that
  *may* be said instead — votive Masses, a commemorated feast taken as the Mass
  on a free feria — are outside it. If they ever come, they come as Masses with
  a color of their own, never as a color on a **Commemoration**.
- A day has one **Color**, that of its Mass. The rites within a day — the
  Easter Vigil on Holy Saturday, the procession of Palm Sunday, a blessing —
  are not modelled, so Holy Saturday and Palm Sunday are violet.
- The **Office** of a day is its propers. The psalter, the ordinary and the
  rubrics that assemble an Hour from them are the reader's; a part of an Hour
  the day says nothing of is said from the psalter.
- The **Seasons** are the rubrics' ten and nothing finer. Holy Week and the
  Triduum are the last days of `passionis`, recognisable by their titles; the
  octaves show through the day's type. No field names a period within a
  season.

## Flagged ambiguities

- "Tijd door het jaar", the Dutch name of `per-annum`, renders the rubrics'
  own *tempus «per annum»* (n. 78); it is not the 1969 "ordinary time", which
  the identifiers avoid.
- Seasons were named in Latin and colors in English on purpose: a season is a
  liturgical identifier like `type`, a color is a presentation value a consumer
  maps straight to a swatch.
