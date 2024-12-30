import { liturgicalTypes } from "./constants";

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type DateString = `${Digit}${Digit}-${Digit}${Digit}`;
export type RelativeDate =
  | DateString
  | "advent"
  | "easter"
  | {
      date: "easter" | "advent";
      difference?: number;
    };

export type LiturgicalClass = 1 | 2 | 3 | 4;
export type LiturgicalType = (typeof liturgicalTypes)[number];
export type LiturgicalDate = {
  date?: "easter";
  difference?: number;
};
