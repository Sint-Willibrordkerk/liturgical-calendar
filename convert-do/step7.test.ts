import { mkdtempSync, rmSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, describe, expect, it } from "vitest";
import { run } from "./step7";

/** A rubric variant; `condition` defaults to the unconditional one. */
const v = (value: unknown, condition: string[] = []) => ({ value, condition });

describe("step7 run", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  async function setup() {
    root = mkdtempSync(join(tmpdir(), "lc-step7-"));
    return { input: join(root, "step6"), output: join(root, "step7") };
  }

  async function put(dir: string, rel: string, doc: unknown) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), JSON.stringify(doc), "utf-8");
  }

  const read = async (dir: string, rel: string) =>
    JSON.parse(await readFile(join(dir, rel), "utf-8"));

  it("borrows the common's keys, so the text stays single", async () => {
    const { input, output } = await setup();
    await put(input, "la/missa/Commune/C2a.json", {
      introitus: [v("statuit-ei-dominus-9f00")],
      oratio: [v("da-quaesumus-1c2d")],
    });
    await put(input, "la/missa/Sancti/09-08cc.json", {
      __preamble: [v(["@Commune/C2a"])],
    });

    await run(input, output);

    const day = await read(output, "la/missa/Sancti/09-08cc.json");
    expect(day.introitus).toEqual([v("statuit-ei-dominus-9f00")]);
    expect(day.oratio).toEqual([v("da-quaesumus-1c2d")]);
    expect(day.__preamble).toBeUndefined();
  });

  it("carries the stores forward, filing nothing new", async () => {
    const { input, output } = await setup();
    const prayers = { "da-quaesumus-1c2d": { text: "Da, quǽsumus…", closure: "Per Dominum" } };
    await put(input, "la/oratio.json", prayers);
    await put(input, "la/lectio.json", {});
    await put(input, "la/antiphona.json", {});
    await put(input, "la/missa/Commune/C2a.json", { oratio: [v("da-quaesumus-1c2d")] });
    await put(input, "la/missa/Sancti/x.json", { rank: [v([";;Simplex;;1.1;;vide C2a"])] });

    await run(input, output);

    expect(await read(output, "la/oratio.json")).toEqual(prayers);
    expect(await read(output, "la/lectio.json")).toEqual({});
  });

  it("does not take the common's Alleluia where the day sings its own Gradual", async () => {
    const { input, output } = await setup();
    await put(input, "la/missa/Commune/C2a.json", {
      graduale: [v("common-gradual")],
      alleluia: [v("common-alleluia")],
    });
    await put(input, "la/missa/Sancti/x.json", {
      rank: [v([";;Simplex;;1.1;;vide C2a"])],
      graduale: [v("own-gradual")],
      tractus: [v("own-tract")],
    });

    await run(input, output);

    const day = await read(output, "la/missa/Sancti/x.json");
    expect(day.graduale).toEqual([v("own-gradual")]);
    expect(day.alleluia).toBeUndefined();
  });

  it("gives a translation the Latin rank, and borrows the translation's own common", async () => {
    const { input, output } = await setup();
    await put(input, "la/missa/Sancti/01-27.json", { rank: [v([";;Duplex;;3;;vide C4a"])] });
    await put(input, "la/missa/Commune/C4a.json", { evangelium: [v("matt-5-13-19")] });
    await put(input, "nl/missa/Commune/C4a.json", { evangelium: [v("matt-5-13-19-nl")] });
    await put(input, "nl/missa/Sancti/01-27.json", { oratio: [v("eigen-gebed")] });

    await run(input, output);

    const day = await read(output, "nl/missa/Sancti/01-27.json");
    expect(day.evangelium).toEqual([v("matt-5-13-19-nl")]);
    expect(day.oratio).toEqual([v("eigen-gebed")]);
  });

  it("gives a translation the Latin rank even where the Latin day is caught in a cycle", async () => {
    // The Latin day and its rubric file include each other. A translation used
    // to wait for the Latin day to be written, which never happened in time.
    const { input, output } = await setup();
    await put(input, "la/missa/Tempora/Pent01-6.json", {
      __preamble: [v(["@Tempora/Pent01-6r"])],
      rank: [v([";;Duplex;;5;;vide C1"])],
    });
    await put(input, "la/missa/Tempora/Pent01-6r.json", { __preamble: [v(["@Tempora/Pent01-6"])] });
    await put(input, "nl/missa/Commune/C1.json", { introitus: [v("nl-introit")] });
    await put(input, "nl/missa/Tempora/Pent01-6.json", {});

    await run(input, output);

    expect((await read(output, "nl/missa/Tempora/Pent01-6.json")).introitus).toEqual([v("nl-introit")]);
  });

  it("resolves a rank borrowed by reference, without following the borrowings it names", async () => {
    // The Dominican Easter Monday takes the Roman day's rank. That rank includes
    // Easter Sunday for the Roman day; it does not make the Dominican one
    // include Easter Sunday as well.
    const { input, output } = await setup();
    await put(input, "la/missa/Tempora/Pasc0-0.json", { officium: [v(["Dominica Resurrectionis"])] });
    await put(input, "la/missa/Tempora/Pasc0-1.json", {
      rank: [v([";;Duplex I classis;;7;;ex Pasc0-0"])],
      officium: [v(["Die II infra octavam Paschæ"])],
    });
    await put(input, "la/horas/TemporaOP/Pasc0-1.json", { rank: [v(["@Tempora/Pasc0-1"])] });

    await run(input, output);

    const day = await read(output, "la/horas/TemporaOP/Pasc0-1.json");
    expect(day.rank).toEqual([v([";;Duplex I classis;;7;;ex Pasc0-0"])]);
    expect(day.officium).toBeUndefined();
  });

  it("keeps a day whose reference the sources do not carry", async () => {
    const { input, output } = await setup();
    await put(input, "la/missa/Sancti/Urbis/07-19.json", {
      rank: [v([";;Simplex;;1.1;;vide aliquibus locis/C4b-3"])],
      oratio: [v("own")],
    });

    await run(input, output);

    expect((await read(output, "la/missa/Sancti/Urbis/07-19.json")).oratio).toEqual([v("own")]);
  });

  it("borrows the Mass's Gospel even where the Office has a Gospel of its own", async () => {
    const { input, output } = await setup();
    await put(input, "la/missa/Commune/C5.json", { evangelium: [v("luc-12-35-40")] });
    await put(input, "la/missa/Sancti/06-13.json", { rank: [v([";;Duplex;;3;;vide C5"])] });
    await put(input, "la/horas/Sancti/06-13.json", {
      rank: [v([";;Duplex;;3;;vide C5"])],
      evangelium: [v(["Secúndum Matthæum"], ["praedicatorum"])],
    });

    await run(input, output);

    expect((await read(output, "la/missa/Sancti/06-13.json")).evangelium).toEqual([
      v("luc-12-35-40"),
    ]);
  });
});
