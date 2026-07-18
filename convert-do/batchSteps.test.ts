import { mkdtempSync, rmSync } from "fs";
import { mkdir, writeFile, readdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { parse, stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { run as runStep8 } from "./step8";
import { run as runStep9 } from "./step9";
import { run as runStep10 } from "./step10";

/** End-to-end check of the batch steps (fan-out, cross-file merge, structuring). */
describe("batch steps 8-10 (run)", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  async function listYml(dir: string) {
    const entries = await readdir(dir, { recursive: true });
    return (entries as string[])
      .filter((e) => e.endsWith(".yml"))
      .map((e) => e.replace(/\\/g, "/"))
      .sort();
  }

  it("names files, merges commemorations across files, structures missa", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-batch-"));
    const step7 = join(root, "step7");
    const step8 = join(root, "step8");
    const step9 = join(root, "step9");
    const step10 = join(root, "step10");
    await mkdir(join(step7, "la", "Sancti"), { recursive: true });

    await writeFile(
      join(step7, "la", "Sancti", "01-01.yml"),
      stringify({
        rank: ["In Circumcisione Domini;;6;;x"],
        oratio: ["Deus qui", "$Per Dominum"],
        "commemoratio-oratio": ["!Pro S. Anastasia", "Da quaesumus"],
      }),
      "utf-8"
    );
    await writeFile(
      join(step7, "la", "Sancti", "01-02.yml"),
      stringify({
        rank: ["Octava Nativitatis;;4"],
        "commemoratio-secreta": ["!Pro S. Anastasia", "Munera nostra"],
      }),
      "utf-8"
    );

    await runStep8(step7, step8);
    await runStep9(step8, step9);
    await runStep10(step9, step10);

    // Step 8: files renamed from the liturgical name; rank folded into name.
    const s8 = await listYml(step8);
    expect(s8).toContain("la/Sancti/in-circumcisione-domini.yml");
    expect(s8).toContain("la/Sancti/octava-nativitatis.yml");
    const named = parse(
      await readFile(join(step8, "la", "Sancti", "in-circumcisione-domini.yml"), "utf-8")
    );
    expect(named.name).toBe("In Circumcisione Domini");
    expect(named.rank).toBeUndefined();

    // Step 9: the two files' commemorations of Anastasia merge into one file.
    const anastasia = parse(
      await readFile(join(step9, "la", "Sancti", "anastasia.yml"), "utf-8")
    );
    expect(anastasia.name).toBe("S. Anastasia");
    expect(anastasia.oratio).toEqual(["Da quaesumus"]);
    expect(anastasia.secreta).toEqual(["Munera nostra"]);
    // ...and the main file no longer carries the commemoratio keys.
    const main9 = parse(
      await readFile(join(step9, "la", "Sancti", "in-circumcisione-domini.yml"), "utf-8")
    );
    expect(main9["commemoratio-oratio"]).toBeUndefined();

    // Step 10: the missa oratio section is structured into { text, closure }.
    const main10 = parse(
      await readFile(join(step10, "la", "Sancti", "in-circumcisione-domini.yml"), "utf-8")
    );
    expect(main10.oratio).toEqual({ text: "Deus qui", closure: "Per Dominum" });
  });
});
