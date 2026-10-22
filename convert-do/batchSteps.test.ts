import { mkdtempSync, rmSync } from "fs";
import { mkdir, writeFile, readdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { run as runStep9 } from "./step9";
import { run as runStep10 } from "./step10";

const v = (value: unknown, condition: string[] = []) => ({ value, condition });

/** End-to-end check of the naming and commemoration steps, with their stores. */
describe("batch steps 9-10 (run)", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  async function listJson(dir: string) {
    const entries = await readdir(dir, { recursive: true });
    return (entries as string[])
      .filter((e) => e.endsWith(".json"))
      .map((e) => e.replace(/\\/g, "/"))
      .sort();
  }

  const read = async (dir: string, rel: string) =>
    JSON.parse(await readFile(join(dir, rel), "utf-8"));

  it("names files, merges a saint across files, and files the saint's prayers", async () => {
    root = mkdtempSync(join(tmpdir(), "lc-batch-"));
    const step8 = join(root, "step8");
    const step9 = join(root, "step9");
    const step10 = join(root, "step10");
    await mkdir(join(step8, "la", "Sancti"), { recursive: true });

    const prayers = { "deus-qui-salutis-1a2b": { text: "Deus qui", closure: "Per Dominum" } };
    await writeFile(join(step8, "la", "oratio.json"), JSON.stringify(prayers), "utf-8");
    await writeFile(join(step8, "la", "lectio.json"), "{}", "utf-8");
    await writeFile(join(step8, "la", "antiphona.json"), "{}", "utf-8");
    await writeFile(
      join(step8, "la", "Sancti", "01-01.json"),
      JSON.stringify({
        rank: [v(["In Circumcisione Domini;;6;;x"])],
        oratio: [v("deus-qui-salutis-1a2b")],
        "commemoratio-oratio": [v(["!Pro S. Anastasia", "Da quaesumus"])],
      }),
      "utf-8"
    );
    await writeFile(
      join(step8, "la", "Sancti", "01-02.json"),
      JSON.stringify({
        rank: [v(["Octava Nativitatis;;4"])],
        "commemoratio-secreta": [v(["!Pro S. Anastasia", "Munera nostra"])],
      }),
      "utf-8"
    );

    await runStep9(step8, step9);
    await runStep10(step9, step10);

    // Step 9: files named from the liturgical name; the stores carried along,
    // and not mistaken for documents to be named.
    const s9 = await listJson(step9);
    expect(s9).toEqual([
      "la/Sancti/in-circumcisione-domini.json",
      "la/Sancti/octava-nativitatis.json",
      "la/antiphona.json",
      "la/lectio.json",
      "la/oratio.json",
    ]);
    const named = await read(step9, "la/Sancti/in-circumcisione-domini.json");
    expect(named.title).toBe("In Circumcisione Domini");
    expect(named.rank).toBeUndefined();
    expect(named.oratio).toEqual([v("deus-qui-salutis-1a2b")]);

    // Step 10: the two files' commemorations of Anastasia merge into one file,
    // whose prayers are keys into the prayer store.
    const anastasia = await read(step10, "la/Sancti/anastasia.json");
    expect(anastasia.name).toBe("S. Anastasia");
    const store = await read(step10, "la/oratio.json");
    expect(store[anastasia.oratio[0].value]).toEqual({ text: "Da quaesumus", closure: "" });
    expect(store[anastasia.secreta[0].value]).toEqual({ text: "Munera nostra", closure: "" });
    expect(store["deus-qui-salutis-1a2b"]).toEqual(prayers["deus-qui-salutis-1a2b"]);
    const main = await read(step10, "la/Sancti/in-circumcisione-domini.json");
    expect(main["commemoratio-oratio"]).toBeUndefined();
  });
});
