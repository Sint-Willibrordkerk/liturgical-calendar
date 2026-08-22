import { describe, expect, it } from "vitest";
import { canonicalizeRef } from "./references";

describe("canonicalizeRef", () => {
  it("folds a book's spellings to one Latin abbreviation", () => {
    expect(canonicalizeRef("Joannes 19:25-27")).toBe("Joann 19:25-27");
    expect(canonicalizeRef("Joann. 19:25-27")).toBe("Joann 19:25-27");
    expect(canonicalizeRef("Isa 7:10-15")).toBe("Is 7:10-15");
    expect(canonicalizeRef("Ephes 5:1-9")).toBe("Ephes 5:1-9");
    expect(canonicalizeRef("Eph 5:1-9")).toBe("Ephes 5:1-9");
  });

  it("folds an English book name into the Latin store", () => {
    expect(canonicalizeRef("1 John 3:13-18")).toBe("1 Joann 3:13-18");
    expect(canonicalizeRef("Acts 2:1-11")).toBe("Act 2:1-11");
    expect(canonicalizeRef("James 1:12")).toBe("Jac 1:12");
  });

  it("settles the number prefix and drops a trailing stop", () => {
    expect(canonicalizeRef("1. Tim 3:1")).toBe("1 Tim 3:1");
    expect(canonicalizeRef("Prov. 8:22-35.")).toBe("Prov 8:22-35");
    expect(canonicalizeRef("1 Petri 1:1-7")).toBe("1 Pet 1:1-7");
  });

  it("corrects a genuine error once the spelling is settled", () => {
    expect(canonicalizeRef("Joannes 21:15-10")).toBe("Joann 21:15-19");
    expect(canonicalizeRef("Dan 5:58")).toBe("Dan 3:58");
    expect(canonicalizeRef("1 Joannnes 4:8-21")).toBe("1 Joann 4:8-21");
    expect(canonicalizeRef("Ps 128:7")).toBe("Ps 123:7");
  });

  it("leaves an unambiguous book untouched", () => {
    expect(canonicalizeRef("1 Cor 13:1-13")).toBe("1 Cor 13:1-13");
    expect(canonicalizeRef("Ps 44:13")).toBe("Ps 44:13");
    expect(canonicalizeRef("Matt 25:31-46")).toBe("Matt 25:31-46");
  });

  it("does not fold two different books onto one another", () => {
    // Ecclesiastes and Ecclesiasticus are not the same book.
    expect(canonicalizeRef("Eccl. 1:2")).toBe("Eccl 1:2");
    expect(canonicalizeRef("Eccli 15:1-6")).toBe("Eccli 15:1-6");
  });

  it("leaves a citation that is not a book reference alone", () => {
    expect(canonicalizeRef("Sedulius")).toBe("Sedulius");
    expect(canonicalizeRef("  In Nativitate Domini  ")).toBe(
      "In Nativitate Domini"
    );
    // A patristic citation keeps its abbreviations and its stops.
    expect(canonicalizeRef("Lib. 10. cap. 16.")).toBe("Lib. 10. cap. 16.");
    expect(canonicalizeRef("Sermo 1 de Nativitate Domini")).toBe(
      "Sermo 1 de Nativitate Domini"
    );
  });
});
