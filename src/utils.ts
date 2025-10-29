import { LiturgicalClass, LiturgicalDate, RelativeDate } from "./types";

export function calculateAdvent(year: number) {
  const advent = new Date(Date.UTC(year, 11, 3));
  advent.setDate(advent.getDate() - advent.getDay());
  return advent;
}

export function calculateEaster(year: number) {
  const a = year % 19,
    b = year % 4,
    c = year % 7,
    k = Math.floor(year / 100),
    p = Math.floor((13 + 8 * k) / 25),
    q = Math.floor(k / 4),
    m = (15 - p + k - q) % 30,
    n = (4 + k - q) % 7,
    d = (19 * a + m) % 30,
    e = (2 * b + 4 * c + 6 * d + n) % 7,
    march_easter = d + e + 22,
    april_easter = d + e - 9;
  console.log(a, b, c, k, p, q, m, n, d, e, march_easter, april_easter);
  if (march_easter <= 31) {
    return new Date(Date.UTC(year, 2, march_easter));
  } else {
    return new Date(Date.UTC(year, 3, april_easter));
  }
}

export function eachDay(
  year: number,
  process: (options: { date: Date; month: number; day: number }) => void
) {
  const date = new Date(year, 0, 1);
  while (date.getFullYear() === year) {
    process({ date, month: date.getMonth() + 1, day: date.getDate() });
    date.setDate(date.getDate() + 1);
  }
}

export function eachLiturgicalClass(
  process: (liturgicalClass: LiturgicalClass) => void
) {
  for (
    let liturgicalClass: LiturgicalClass = 4;
    liturgicalClass >= 1;
    liturgicalClass = (liturgicalClass - 1) as LiturgicalClass
  ) {
    process(liturgicalClass);
  }
}

export function getDate(
  input: LiturgicalDate,
  advent: Date,
  easter: Date,
  year: number
): Date {
  if (typeof input === "string") {
    return matchDateString(input, advent, easter, year);
  } else {
    const date = matchDateString(input.date, advent, easter, year);
    if (input.difference) date.setDate(date.getDate() + input.difference);
    return date;
  }
}

export function matchDateString(
  date: string,
  advent: Date,
  easter: Date,
  year: number
) {
  switch (date) {
    case "advent":
      return new Date(advent);
    case "easter":
      return new Date(easter);
    default:
      return new Date(`${year}-${date.split("-")[1]}-${date.split("-")[0]}`);
  }
}
