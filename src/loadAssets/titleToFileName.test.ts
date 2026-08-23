import { describe, expect, it } from "vitest";
import { titleToFileName } from "./index";
import { toKebabFileName } from "../../convert-do/step7";

/**
 * The pipeline names a file from a liturgical name, and the calendar looks one
 * up from the same name. They are two functions in two packages, and they must
 * agree exactly: where they differ the file is written under one name and read
 * under another, and the day comes out with no Mass.
 *
 * Nothing catches that at build time — both sides go on working, the propers
 * are simply never found — so it is pinned here. The Dutch broke this way once
 * already, and the ligature rule that fixed it had to be made in both places.
 */
describe("the calendar's lookup and the pipeline's filing", () => {
  const names = [
    "S. Adriani, Martyris",
    "Ss. Fabiani et Sebastiani",
    "B. Mariae Virginis",
    "Bb. Martyrum Ugandensium",
    "Adriáni",
    "Sanctæ Familiæ Jesu Mariæ Joseph",
    "Feria Quinta in Cœna Domini",
    "Infra Octavam Paschæ",
    "Infra Octavam Paschae",
    "In Dedic. Archbasilicæ Ssm̃i. Salvatoris",
    "Dominica XXIV et ultima post Pentecosten",
    "S. Joseph Sponsi B. Mariæ V.",
    "sanctae-mariae-sabbato",
    "In Circumcisione Domini",
  ];

  it.each(names)("agree on %s", (name) => {
    expect(titleToFileName(name)).toBe(toKebabFileName(name));
  });

  it("agree that the ligatures are spelled out", () => {
    expect(titleToFileName("Paschæ")).toBe(titleToFileName("Paschae"));
    expect(toKebabFileName("Paschæ")).toBe(toKebabFileName("Paschae"));
  });
});
