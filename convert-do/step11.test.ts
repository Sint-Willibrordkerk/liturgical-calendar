import { mkdtempSync, rmSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { collapseVariants, run } from "./step11";

/** A rubric variant; `condition` defaults to the unconditional (default) one. */
const v = <T>(value: T, condition: string[] = []) => ({ value, condition });

describe("step11 — variant collapse", () => {
  it("drops variants that repeat the default", () => {
    const same = { antiphon: "Omnis terra…", verse: "Jubiláte…" };
    const other = { antiphon: "Aliud…", verse: "Aliud…" };

    expect(
      collapseVariants({
        introitus: [
          v(same),
          v(same, ["cisterciensis"]),
          v(same, ["monastica"]),
          v(other, ["1570"]),
        ],
      })
    ).toEqual({ introitus: [v(same), v(other, ["1570"])] });
  });

  it("leaves only the default when every variant matches it", () => {
    const same = { text: "x", closure: "y" };
    expect(
      collapseVariants({
        oratio: [v(same), v(same, ["monastica"]), v(same, ["praedicatorum"])],
      })
    ).toEqual({ oratio: [v(same)] });
  });

  it("removes nothing when the section has no default", () => {
    const same = { text: "x", closure: "y" };
    const section = [v(same, ["1570"]), v(same, ["monastica"])];

    expect(collapseVariants({ oratio: section })).toEqual({ oratio: section });
  });

  it("compares whole values, not just their first field", () => {
    const base = { ref: "Ps 65:4", text: "a" };
    expect(
      collapseVariants({
        communio: [v(base), v({ ref: "Ps 65:4", text: "b" }, ["monastica"])],
      })
    ).toEqual({
      communio: [v(base), v({ ref: "Ps 65:4", text: "b" }, ["monastica"])],
    });
  });

  it("applies to every section, not only the covered ones", () => {
    const lines = ["a", "b"];
    expect(
      collapseVariants({
        lectio1: [v(lines), v(lines, ["monastica"])],
        "ant-laudes": [v(lines), v(lines, ["cisterciensis"])],
      })
    ).toEqual({ lectio1: [v(lines)], "ant-laudes": [v(lines)] });
  });

  it("keeps a variant whose condition is empty but is the default itself", () => {
    expect(collapseVariants({ oratio: [v({ text: "x" })] })).toEqual({
      oratio: [v({ text: "x" })],
    });
  });

  it("leaves a section that is not a variant list unchanged", () => {
    const obj = { prefatio: "trinitate", name: "Sanctæ Familiæ" };
    expect(collapseVariants(obj)).toEqual(obj);
  });
});

describe("step11 — collapsing on keys", () => {
  it("folds a section filed under one key for every rubric to its default", () => {
    expect(
      collapseVariants({
        evangelium: [
          v("matt-11-25-30"),
          v("matt-11-25-30", ["cisterciensis"]),
          v("matt-11-25-30", ["transfer", "1570"]),
        ],
      })
    ).toEqual({ evangelium: [v("matt-11-25-30")] });
  });

  it("keeps a rubric that reads something else", () => {
    expect(
      collapseVariants({
        lectio: [v("2-cor-1-1-5"), v("2-cor-1-1-5", ["monastica"]), v("rom-12-6-16", ["1570"])],
      })
    ).toEqual({ lectio: [v("2-cor-1-1-5"), v("rom-12-6-16", ["1570"])] });
  });
});

describe("step11 — run", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("collapses every document and carries the stores forward unchanged", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step11-"));
    const input = join(root, "step10");
    const output = join(root, "step11");
    await mkdir(join(input, "la", "Sancti"), { recursive: true });
    const store = { "matt-11-25-30": { ref: "Matt 11:25-30", verses: ["In illo…"] } };
    await writeFile(join(input, "la", "lectio.json"), JSON.stringify(store), "utf-8");
    await writeFile(
      join(input, "la", "Sancti", "x.json"),
      JSON.stringify({ evangelium: [v("matt-11-25-30"), v("matt-11-25-30", ["monastica"])] }),
      "utf-8"
    );

    await run(input, output);

    expect(JSON.parse(await readFile(join(output, "la", "lectio.json"), "utf-8"))).toEqual(store);
    expect(JSON.parse(await readFile(join(output, "la", "Sancti", "x.json"), "utf-8"))).toEqual({
      evangelium: [v("matt-11-25-30")],
    });
  });
});
