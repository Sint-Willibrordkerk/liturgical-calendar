export const namedDates = ["easter", "advent"] as const;

export const weekdays = {
  dominica: 0,
  feriaII: 1,
  feriaIII: 2,
  feriaIV: 3,
  feriaV: 4,
  feriaVI: 5,
  sabbato: 6,
};

export const liturgicalTypes = [
  "dominica",
  "feria",
  "festum",
  "octava",
  "vigilia",
] as const;

export const properTypes = [
  "congregationis",
  "congregationis-patroni-secundarii",
  "congregationis-fundatoris-beatificati",
  "dioecesis",
  "dioecesis-patroni-secundarii",
  "ecclesiae",
  "loci-patroni-secundarii",
  "regionis-patroni-secundarii",
  "nationis-patroni-secundarii",
  "congregationis-patroni-principalis",
  "congregationis-fundatoris-canonizati",
  "congregationis-tituli",
  "ecclesiae-tituli",
  "ecclesiae-dedicationis",
  "loci-patroni-principalis",
  "cathedralis-dedicationis",
  "dioecesis-patroni-principalis",
  "regionis-patroni-principalis",
  "nationis-patroni-principalis",
  "indulta",
] as const;

export const sanctorumTypes = ["vigilia", "domini", "custom"] as const;
