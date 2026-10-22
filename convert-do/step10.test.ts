import { mkdtempSync, rmSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  transform,
  extractCommemorations,
  withoutCommemoratioKeys,
  commemorationNameToSlug,
  run,
} from "./step10";

const v = (value: string[], condition: string[] = []) => ({ value, condition });

describe("step10 commemorations", () => {
  it("slugs a Pro-line, dropping the S./Ss. honorific", () => {
    expect(commemorationNameToSlug("!Pro S. Anastasia")).toBe("anastasia");
    expect(commemorationNameToSlug("Pro Ss. Stephano Protomartyre")).toBe(
      "stephano-protomartyre"
    );
    expect(commemorationNameToSlug("not a pro line")).toBeNull();
  });

  it("names a commemoration the way every other file is named", () => {
    // A name ending in a stop used to leave one in the filename, giving
    // `octava-nativitatis..yml`, which no lookup could reach.
    expect(commemorationNameToSlug("!Pro Octava Nativitatis.")).toBe(
      "octava-nativitatis"
    );
    expect(commemorationNameToSlug("!Pro S. Hadriáni, Martyris")).toBe(
      "hadriani-martyris"
    );
  });

  it("extracts commemoration sections keyed by slug, preserving variants", () => {
    const comms = extractCommemorations({
      "commemoratio-oratio": [v(["!Pro S. Anastasia", "oratio line 1"])],
      "commemoratio-secreta": [v(["!Pro S. Anastasia", "secreta line 1"])],
    });
    expect(comms).toHaveLength(1);
    expect(comms[0]).toMatchObject({
      slug: "anastasia",
      displayName: "S. Anastasia",
      oratio: [v(["oratio line 1"])],
      secreta: [v(["secreta line 1"])],
      postcommunio: [],
    });
  });

  it("splits distinct saints across a section's variants", () => {
    const comms = extractCommemorations({
      "commemoratio-oratio": [
        v(["!Pro S. Anastasia", "a"]),
        v(["!Pro S. Stephano", "b"], ["1570"]),
      ],
    });
    expect(comms.map((c) => c.slug).sort()).toEqual(["anastasia", "stephano"]);
    const stephano = comms.find((c) => c.slug === "stephano")!;
    expect(stephano.oratio).toEqual([v(["b"], ["1570"])]);
  });

  it("removes commemoratio keys from the main object", () => {
    expect(
      withoutCommemoratioKeys({
        lectio1: [v(["x"])],
        "commemoratio-oratio": [v(["!Pro S. Anastasia", "a"])],
      })
    ).toEqual({ lectio1: [v(["x"])] });
  });

  it("transform returns both the stripped main and the commemorations", () => {
    const { main, commemorations } = transform({
      lectio1: [v(["x"])],
      "commemoratio-oratio": [v(["!Pro S. Anastasia", "a"])],
    });
    expect(main).toEqual({ lectio1: [v(["x"])] });
    expect(commemorations).toHaveLength(1);
    expect(commemorations[0]!.slug).toBe("anastasia");
  });
});

describe("step10 run", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  async function put(dir: string, rel: string, doc: unknown) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), JSON.stringify(doc), "utf-8");
  }

  const read = async (dir: string, rel: string) =>
    JSON.parse(await readFile(join(dir, rel), "utf-8"));

  it("files a saint's prayers in the prayer store and leaves their keys", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step10-"));
    const input = join(root, "step9");
    const output = join(root, "step10");
    await put(input, "la/oratio.json", {});
    await put(input, "la/Sancti/in-circumcisione-domini.json", {
      oratio: [{ value: "deus-qui-salutis-1a2b", condition: [] }],
      "commemoratio-oratio": [
        { value: ["!Pro S. Anastasia", "Da, quǽsumus…", "$Per Dominum"], condition: [] },
      ],
    });

    await run(input, output);

    const anastasia = await read(output, "la/Sancti/anastasia.json");
    expect(anastasia.name).toBe("S. Anastasia");
    const [variant] = anastasia.oratio;
    expect(variant.condition).toEqual([]);
    expect(typeof variant.value).toBe("string");
    expect((await read(output, "la/oratio.json"))[variant.value]).toEqual({
      text: "Da, quǽsumus…",
      closure: "Per Dominum",
    });
    const main = await read(output, "la/Sancti/in-circumcisione-domini.json");
    expect(main["commemoratio-oratio"]).toBeUndefined();
    expect(main.oratio).toEqual([{ value: "deus-qui-salutis-1a2b", condition: [] }]);
  });

  it("gives a saint's prayer the key the store already holds for it", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-step10-reuse-"));
    const input = join(root, "step9");
    const output = join(root, "step10");
    const filed = {
      "da-quaesumus-omnipotens-deus-0c0ffee0": {
        text: "Da, quǽsumus, omnípotens Deus…",
        closure: "Per Dominum",
      },
    };
    await put(input, "la/oratio.json", filed);
    await put(input, "la/lectio.json", { "matt-5-1-12": { ref: "Matt 5:1-12", verses: ["x"] } });
    await put(input, "la/Sancti/a.json", {
      "commemoratio-oratio": [
        { value: ["!Pro S. Anastasia", "Da, quǽsumus, omnípotens Deus…", "$Per Dominum"], condition: [] },
      ],
    });

    await run(input, output);

    expect((await read(output, "la/Sancti/anastasia.json")).oratio).toEqual([
      { value: "da-quaesumus-omnipotens-deus-0c0ffee0", condition: [] },
    ]);
    expect(await read(output, "la/oratio.json")).toEqual(filed);
    expect(await read(output, "la/lectio.json")).toEqual({
      "matt-5-1-12": { ref: "Matt 5:1-12", verses: ["x"] },
    });
  });
});
