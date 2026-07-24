import { mkdtempSync, rmSync } from "fs";
import { mkdir, writeFile, readdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { run as runStep7 } from "./step7";
import { run as runStep8 } from "./step8";
import { run as runStep9 } from "./step9";

const v = (value: unknown, condition: string[] = []) => ({ value, condition });

/** End-to-end check of the batch steps (fan-out, cross-file merge, structuring). */
describe("batch steps 7-9 (run)", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  async function listYml(dir: string) {
    const entries = await readdir(dir, { recursive: true });
    return (entries as string[])
      .filter((e) => e.endsWith(".json"))
      .map((e) => e.replace(/\\/g, "/"))
      .sort();
  }

  it("names files, merges commemorations across files, structures missa", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-batch-"));
    const step6 = join(root, "step6");
    const step7 = join(root, "step7");
    const step8 = join(root, "step8");
    const step9 = join(root, "step9");
    await mkdir(join(step6, "la", "Sancti"), { recursive: true });

    await writeFile(
      join(step6, "la", "Sancti", "01-01.json"),
      JSON.stringify({
        rank: [v(["In Circumcisione Domini;;6;;x"])],
        oratio: [v(["Deus qui", "$Per Dominum"])],
        "commemoratio-oratio": [v(["!Pro S. Anastasia", "Da quaesumus"])],
      }),
      "utf-8"
    );
    await writeFile(
      join(step6, "la", "Sancti", "01-02.json"),
      JSON.stringify({
        rank: [v(["Octava Nativitatis;;4"])],
        "commemoratio-secreta": [v(["!Pro S. Anastasia", "Munera nostra"])],
      }),
      "utf-8"
    );

    await runStep7(step6, step7);
    await runStep8(step7, step8);
    await runStep9(step8, step9);

    // Step 7: files renamed from the liturgical name; rank folded into a name variant.
    const s7 = await listYml(step7);
    expect(s7).toContain("la/Sancti/in-circumcisione-domini.json");
    expect(s7).toContain("la/Sancti/octava-nativitatis.json");
    const named = parse(
      await readFile(join(step7, "la", "Sancti", "in-circumcisione-domini.json"), "utf-8")
    );
    expect(named.title).toBe("In Circumcisione Domini");
    expect(named.rank).toBeUndefined();

    // Step 8: the two files' commemorations of Anastasia merge into one file,
    // keeping the variant shape; the main file drops the commemoratio keys.
    const anastasia = parse(
      await readFile(join(step8, "la", "Sancti", "anastasia.json"), "utf-8")
    );
    expect(anastasia.name).toBe("S. Anastasia");
    expect(anastasia.oratio).toEqual([v(["Da quaesumus"])]);
    expect(anastasia.secreta).toEqual([v(["Munera nostra"])]);
    const main8 = parse(
      await readFile(join(step8, "la", "Sancti", "in-circumcisione-domini.json"), "utf-8")
    );
    expect(main8["commemoratio-oratio"]).toBeUndefined();

    // Step 9: each missa section variant is structured into { text, closure }.
    const main9 = parse(
      await readFile(join(step9, "la", "Sancti", "in-circumcisione-domini.json"), "utf-8")
    );
    expect(main9.oratio).toEqual([v({ text: "Deus qui", closure: "Per Dominum" })]);
    const anastasia9 = parse(
      await readFile(join(step9, "la", "Sancti", "anastasia.json"), "utf-8")
    );
    expect(anastasia9.oratio).toEqual([v({ text: "Da quaesumus", closure: "" })]);
  });
});
