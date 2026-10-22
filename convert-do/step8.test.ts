import { mkdtempSync, rmSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  transform,
  getOutputFile,
  isCommemorationFile,
  mergeDocuments,
  run,
} from "./step8";

describe("step8 the Martyrology's movable days", () => {
  it("keeps the name of a file that is no date", () => {
    expect(getOutputFile("la\\Martyrologium\\Mobile.json")).toBe(
      "la\\Martyrologium\\Mobile.json"
    );
  });

  it("adds no condition for it", () => {
    expect(
      transform(
        { "adv1-0": [{ value: ["Dominica prima Adventus."], condition: [] }] },
        "la\\Martyrologium\\Mobile.json"
      )
    ).toEqual({
      "adv1-0": [{ value: ["Dominica prima Adventus."], condition: [] }],
    });
  });
});

describe("step8 mergeDocuments", () => {
  it("keeps the earlier document's variants first, and lets them win a collision", () => {
    // 7 December: the Roman file gives a Cistercian rank of its own, which
    // stands over the Cistercian file's.
    expect(
      mergeDocuments(
        {
          rank: [
            { value: ["Duplex"], condition: [] },
            { value: ["nihil"], condition: ["cisterciensis"] },
          ],
        },
        {
          rank: [{ value: ["In Vigilia Immaculatæ Conceptionis"], condition: ["cisterciensis"] }],
          name: [{ value: ["n"], condition: [] }],
        }
      )
    ).toEqual({
      rank: [
        { value: ["Duplex"], condition: [] },
        { value: ["nihil"], condition: ["cisterciensis"] },
      ],
      name: [{ value: ["n"], condition: [] }],
    });
  });
});

describe("step8 transform", () => {
  it("turns a filename rubric suffix into a condition", () => {
    // `01-01t` — the `t` suffix maps to the 1570 rubric.
    expect(
      transform(
        { oratio: [{ value: ["x"], condition: [] }] },
        "Sancti\\01-01t.json"
      )
    ).toEqual({ oratio: [{ condition: ["1570"], value: ["x"] }] });
  });

  it("adds a directory-variant condition", () => {
    // `SanctiCist` — the Cist directory maps to cisterciensis.
    expect(
      transform(
        { name: [{ value: ["Foo"], condition: [] }] },
        "SanctiCist\\01-01.json"
      )
    ).toEqual({ name: [{ condition: ["cisterciensis"], value: ["Foo"] }] });
  });

  it("extends an existing variant condition instead of replacing it", () => {
    // A step-1 header condition (1570) is kept, with the directory token added.
    expect(
      transform(
        { oratio: [{ value: ["x"], condition: ["1570"] }] },
        "SanctiCist\\01-01.json"
      )
    ).toEqual({ oratio: [{ condition: ["1570", "cisterciensis"], value: ["x"] }] });
  });

  it("derives the same conditions from a POSIX input path", () => {
    expect(
      transform({ oratio: [{ value: ["x"], condition: [] }] }, "Sancti/01-01t.json")
    ).toEqual({ oratio: [{ condition: ["1570"], value: ["x"] }] });
    expect(
      transform(
        { name: [{ value: ["Foo"], condition: [] }] },
        "SanctiCist/01-01.json"
      )
    ).toEqual({ name: [{ condition: ["cisterciensis"], value: ["Foo"] }] });
  });
});

describe("step8 getOutputFile", () => {
  it("folds a variant directory into its base", () => {
    expect(getOutputFile("root\\SanctiCist\\01-01.json")).toBe(
      "root\\Sancti\\01-01.json"
    );
  });

  it("strips a filename rubric suffix", () => {
    expect(getOutputFile("root\\Sancti\\01-01t.json")).toBe(
      "root\\Sancti\\01-01.json"
    );
  });

  it("folds and strips on POSIX paths", () => {
    expect(getOutputFile("root/SanctiCist/01-01.json")).toBe(
      "root/Sancti/01-01.json"
    );
    expect(getOutputFile("root/Sancti/01-01t.json")).toBe(
      "root/Sancti/01-01.json"
    );
  });
});

describe("step8 commemorations stand alone", () => {
  it("keeps a commemoration on its own path", () => {
    expect(getOutputFile("root/Sancti/09-08cc.json")).toBe(
      "root/Sancti/09-08cc.json"
    );
    expect(getOutputFile("root/Sancti/01-05octt.json")).toBe(
      "root/Sancti/01-05octt.json"
    );
  });

  it("still folds the day itself onto its base", () => {
    expect(getOutputFile("root/Sancti/09-08t.json")).toBe(
      "root/Sancti/09-08.json"
    );
  });

  it("does not condition a standalone commemoration on `commemoratio`", () => {
    const out = transform(
      { oratio: [{ value: ["Adrian"], condition: [] }] } as never,
      "root/Sancti/09-08cc.json"
    );
    expect(out.oratio).toEqual([{ value: ["Adrian"], condition: [] }]);
  });

  it("recognises a commemoration filename", () => {
    expect(isCommemorationFile("09-08cc")).toBe(true);
    expect(isCommemorationFile("01-05octt")).toBe(true);
    expect(isCommemorationFile("09-08")).toBe(false);
    expect(isCommemorationFile("09-08t")).toBe(false);
  });
});

describe("step8 keys", () => {
  it("conditions a keyed value the same way it would its lines", () => {
    expect(
      transform(
        { evangelium: [{ value: "matt-5-1-12", condition: [] }] } as never,
        "la/SanctiCist/01-01.json"
      )
    ).toEqual({ evangelium: [{ condition: ["cisterciensis"], value: "matt-5-1-12" }] });
  });
});

describe("step8 run", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  async function put(dir: string, rel: string, doc: unknown) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), JSON.stringify(doc), "utf-8");
  }

  it("folds the variant files of a day onto one, carrying the stores forward", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step8-"));
    const input = join(root, "step7");
    const output = join(root, "step8");
    const store = { "statuit-1a2b": { antiphon: { ref: "Eccli 45:30", text: "Státuit…" } } };
    await put(input, "la/antiphona.json", store);
    await put(input, "la/missa/Sancti/01-01.json", { introitus: [{ value: "puer-natus", condition: [] }] });
    await put(input, "la/missa/Sancti/01-01t.json", { introitus: [{ value: "dum-medium", condition: [] }] });
    await put(input, "la/missa/SanctiCist/01-01.json", { introitus: [{ value: "puer-natus", condition: [] }] });
    await put(input, "la/missa/Sancti/09-08cc.json", { oratio: [{ value: "adrian", condition: [] }] });

    await run(input, output);

    const day = JSON.parse(await readFile(join(output, "la/Sancti/01-01.json"), "utf-8"));
    expect(day.introitus).toEqual(
      expect.arrayContaining([
        { value: "puer-natus", condition: [] },
        { value: "dum-medium", condition: ["1570"] },
        { value: "puer-natus", condition: ["cisterciensis"] },
      ])
    );
    expect(day.introitus).toHaveLength(3);
    expect(JSON.parse(await readFile(join(output, "la/Sancti/09-08cc.json"), "utf-8"))).toEqual({
      oratio: [{ value: "adrian", condition: [] }],
    });
    expect(JSON.parse(await readFile(join(output, "la/antiphona.json"), "utf-8"))).toEqual(store);
  });

  it("takes the Alleluia from the document whose Gradual it takes", async () => {
    // The Vigil of St Andrew: the Mass gives its own Gradual and no Alleluia;
    // the Office, including the common, carries the common's Gradual and
    // Alleluia. The Mass's Gradual stands, and the Alleluia goes with the
    // Gradual it lost to.
    root = mkdtempSync(join(tmpdir(), "lc-step8-lifted-"));
    const input = join(root, "step7");
    const output = join(root, "step8");
    await put(input, "la/horas/Sancti/11-29.json", {
      graduale: [{ value: "common-gradual", condition: [] }],
      alleluia: [{ value: "common-alleluia", condition: [] }],
      rule: [{ value: ["9 lectiones"], condition: [] }],
      prefatio: [{ value: "communis", condition: [] }],
    });
    await put(input, "la/missa/Sancti/11-29.json", {
      graduale: [{ value: "vigil-gradual", condition: [] }],
      rule: [{ value: ["Credo"], condition: [] }],
    });

    await run(input, output);

    const day = JSON.parse(await readFile(join(output, "la/Sancti/11-29.json"), "utf-8"));
    expect(day.graduale).toEqual([{ value: "vigil-gradual", condition: [] }]);
    expect(day.alleluia).toBeUndefined();
    expect(day.prefatio).toBeUndefined();
  });

  it("combines a day's Mass and Office, the Mass winning a collision", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step8-sources-"));
    const input = join(root, "step7");
    const output = join(root, "step8");
    await put(input, "la/horas/Sancti/06-13.json", {
      oratio: [{ value: "office-collect", condition: [] }],
      evangelium: [{ value: ["Secúndum Matthæum"], condition: ["praedicatorum"] }],
      "ant-laudes": [{ value: ["Ecce"], condition: [] }],
    });
    await put(input, "la/missa/Sancti/06-13.json", {
      oratio: [{ value: "mass-collect", condition: [] }],
      evangelium: [{ value: "luc-12-35-40", condition: [] }],
    });

    await run(input, output);

    const day = JSON.parse(await readFile(join(output, "la/Sancti/06-13.json"), "utf-8"));
    expect(day.oratio).toEqual([{ value: "mass-collect", condition: [] }]);
    expect(day.evangelium).toEqual(
      expect.arrayContaining([
        { value: "luc-12-35-40", condition: [] },
        { value: ["Secúndum Matthæum"], condition: ["praedicatorum"] },
      ])
    );
    expect(day["ant-laudes"]).toEqual([{ value: ["Ecce"], condition: [] }]);
  });
});
