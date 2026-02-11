import { join } from "path";
import { COPY_BASE, MODIFY_BASE } from "./common/config.mjs";
import { cp, readFile, writeFile } from "fs/promises";
import { executeStep } from "./common/step.mjs";
import { logger } from "./common/logger.mjs";

const addUnderscores = (lines) =>
  lines.map((line) => ({ line, before: "", after: "_" }));

const deleteLine = (line, before = "") => ({ line, delete: true, before });

const deleteLines = (lines) =>
  lines.map((line) => ({ line, delete: true, before: "" }));

const insertLine = (line, content) => ({ line, insert: content });

const DELETE_MARKER = Symbol("delete");

const MODIFICATIONS = {
  "Tempora/Pasc0-0": addUnderscores([115, 121]),
  "Tempora/Pasc0-6": addUnderscores([36]),
  "Tempora/Pasc0-6t": addUnderscores([36]),
  "Tempora/Pasc1-0t": [
    { line: 1, before: "Tempora/Pasc1-0", after: "@Tempora/Pasc1-0" },
  ],
  "Tempora/Pasc6-5": [
    deleteLine(123, "[Commemoratio 2]"),
    deleteLine(126, "[Commemoratio 3]"),
    ...deleteLines([18, 124, 125, 127, 128]),
  ],
  "Tempora/Quad2-5": addUnderscores([37]),
  "Tempora/Quad6-0": addUnderscores([42]),
  "Tempora/Quad6-2": deleteLines([54, 57]),
  "Tempora/Quad6-3": [deleteLine(77)],
  "Tempora/Quad6-4": addUnderscores([229, 231, 233, 235, 237, 239]),
  "Tempora/Quad6-4rm2": [
    ...addUnderscores([188, 216, 232, 244, 284]),
    ...deleteLines([233, 245]),
  ],
  "Tempora/Quad6-5r": [deleteLine(159), ...addUnderscores([435])],
  "Tempora/Quad6-6": [deleteLine(608)],
  "Tempora/Quad6-6r": addUnderscores([
    14, 16, 18, 24, 26, 62, 64, 70, 76, 82, 99, 102, 105, 115, 117, 124, 126,
    128, 131, 133, 135, 137, 204, 265, 280, 282, 284, 286, 288, 290, 292, 294,
    296, 298, 300, 302, 304, 306, 308, 310, 312, 314, 316, 318, 322, 324, 326,
    328, 333, 347, 349, 361, 363, 365, 371, 373, 375, 377, 379, 399, 404, 406,
    408, 410, 412, 450, 452, 454, 473, 475, 477, 479, 540, 542, 704, 767, 769,
    789, 800, 802, 808, 810, 812, 814, 850, 852, 854, 856, 858, 860,
  ]),
  "SanctiM/04-26": [deleteLine(1, "[Rule]"), deleteLine(2)],
  "SanctiM/05-30b": [
    ...addUnderscores([73]),
    deleteLine(100, "[Ant Matutinum]"),
    deleteLine(101, "Eleváta est * magnificéntia Joánnæ super cælos.;;8"),
    deleteLine(
      102,
      "Veni, elécta mea,  * et ponam in te thronum meum, quia concupívit Rex spéciem tuam.;;18"
    ),
    deleteLine(
      103,
      "Accépit * benedictiónem a Dómino, et misericórdiam a Deo salutári suo.;;23"
    ),
    deleteLine(
      104,
      "Propter veritátem, * et mansuetúdinem, et justítiam: dedúcet te mirabíliter déxtera tua.;;44"
    ),
    deleteLine(
      105,
      "Arcum cónteret, * et confrínget arma, et scuta combúret igni.;;45"
    ),
    deleteLine(106, "Justítia et misericórdia * plena est déxtera tua.;;47"),
    deleteLine(107, "V. Méritis et précibus beátæ Joánnæ."),
    deleteLine(108, "R. Propítius esto, Dómine, pópulo tuo."),
    deleteLine(109, ";;84"),
    deleteLine(110, ";;86"),
    deleteLine(
      111,
      "Conféssio et pulchritúdo * in conspéctu ejus, sánctitas et magnificéntia in sanctificatióne ejus.;;95"
    ),
    deleteLine(
      112,
      "Annuntiavérunt cæli * justítiam ejus, et vidérunt omnes pópuli glóriam ejus.;;96"
    ),
    deleteLine(113, "Judicávit in justítia, et pópulos in æquitáte.;;97"),
    deleteLine(114, ";;98"),
    deleteLine(115, "V. Factus est Dóminus suscéptor meus."),
    deleteLine(116, "R. Et refúgium meum in die tribulatiónis."),
    deleteLine(117, ";;249;250;251"),
    deleteLine(118, "V. Posuísti, Dómine, super caput ejus."),
    deleteLine(119, "R. Corónam de lápide pretióso."),
    deleteLine(120),
  ],
  "SanctiM/06-23": [deleteLine(3, "[Rule]"), deleteLine(4)],
  "SanctiM/07-26r": addUnderscores([192]),
  "SanctiM/08-09t": [deleteLine(3, "[Commemoratio]"), deleteLine(4)],
  "SanctiM/08-06": [deleteLine(109, "[Commemoratio 2]"), deleteLine(110)],
  "SanctiM/08-14": [deleteLine(3, "[Commemoratio]"), deleteLine(4)],
  "SanctiM/10-21": [deleteLine(3, "[Commemoratio]"), deleteLine(4)],
  "SanctiM/11-01": [deleteLine(7)],
  "SanctiM/11-02": [
    deleteLine(26),
    ...addUnderscores([76, 78, 92, 94, 108, 110]),
  ],
  "SanctiM/11-14M": addUnderscores([25, 27, 36]),
  "SanctiM/12-13": [
    {
      line: 1,
      before: "(nisi rubrica cisterciensis)",
      after: "(nisi rubrica cisterciensis)@Sancti/12-13",
    },
    deleteLine(2, "@Sancti/12-13"),
  ],
  "Sancti/03-12": [
    {
      line: 80,
      before: "[Lectio7] (sed rubrica tridentina)",
      after: "[Lectio7] (rubrica tridentina)",
    },
    {
      line: 92,
      before: "[Lectio8] (sed rubrica tridentina)",
      after: "[Lectio8] (rubrica tridentina)",
    },
  ],
  "Sancti/05-07": [deleteLine(9, "[Rule]"), deleteLine(10)],
  "Sancti/06-24": [
    deleteLine(207, "[Ant Matutinum]"),
    deleteLine(
      208,
      "Priúsquam te formárem * in útero, novi te; et ántequam progrederéris, sanctificávi te.;;1"
    ),
    deleteLine(
      209,
      "Ad ómnia quæ mittam te, * dicit Dóminus, ibis: ne tímeas, et quæ mandávero tibi, loquéris ad eos.;;2"
    ),
    deleteLine(
      210,
      "Ne tímeas * a fácie eórum, quia ego tecum sum, dicit Dóminus.;;3"
    ),
    deleteLine(
      211,
      "Misit Dóminus * manum suam, et tétigit os meum, et prophétam in géntibus dedit me Dóminus.;;4"
    ),
    deleteLine(
      212,
      "Ecce dedi verba mea * in ore tuo: ecce constítui te super gentes et regna.;;5"
    ),
    deleteLine(
      213,
      "Dóminus * ab útero vocávit me, de ventre matris meæ recordátus est nóminis mei.;;8"
    ),
    deleteLine(
      214,
      "Pósuit os meum * Dóminus quasi gládium acútum: sub umbra manus suæ protéxit me.;;14"
    ),
    deleteLine(
      215,
      "Formans me * ex útero servum sibi Dóminus, dicit: Dedi te in lucem géntium, ut sis salus mea usque ad extrémum terræ.;;20"
    ),
    deleteLine(
      216,
      "Reges vidébunt, * et consúrgent príncipes et adorábunt Dóminum Deum tuum, qui elégit te.;;33"
    ),
    deleteLine(217),
  ],
  "Sancti/11-02": addUnderscores([
    127, 129, 131, 133, 135, 144, 150, 152, 154, 156, 158, 164, 166, 168, 170,
    172, 178, 180, 182, 184, 186, 193, 195, 197, 199, 201, 203,
  ]),
  "Sancti/11-04r": [deleteLine(1, "[Rule]"), deleteLine(2)],
  "Sancti/12-13t": [deleteLine(2, "@Sancti/12-13")],
  "Psalterium/Common/Prayers": [
    deleteLine(279, "[pretiosa]"),
    deleteLine(280, "@:Pretiosa"),
  ],
  "Psalterium/Special/Preces": addUnderscores([133, 162]),
  "Psalterium/Special/Prima Special": addUnderscores([153]),
  "Psalterium/Chant": [
    { line: 95, before: "Matins C8]", after: "[Matins C8]" },
  ],
  "Psalterium/Invitatorium": [insertLine(1, "[Invitatorium]")],
  "Psalterium/Monastic canticles": [insertLine(1, "[Monastic canticles]")],
  "Psalterium/Revtrans": [
    insertLine(17, "Gloria omittitur"),
    deleteLine(18, "[gloria]"),
    deleteLine(19, "&Gloria1"),
    deleteLine(20),
  ],
  "CommuneM/C12": addUnderscores([44, 197]),
  "Commune/C12": [
    ...deleteLines([57, 77, 140, 151]),
    ...addUnderscores([
      145, 198, 206, 210, 215, 222, 231, 237, 252, 262, 268, 278, 287, 306, 316,
      322, 332, 339, 359, 369, 375, 385, 392, 428, 434, 438, 441, 444, 455, 461,
      467, 477, 491,
    ]),
  ],
  "Commune/C12A": addUnderscores([
    112, 116, 118, 122, 132, 136, 138, 142, 153, 157, 159, 163, 173, 177, 179,
    183, 201, 206, 210,
  ]),
  "Commune/C12N": [
    deleteLine(19),
    ...addUnderscores([
      34, 38, 40, 44, 54, 58, 60, 64, 74, 78, 80, 84, 94, 98, 100, 104, 119,
      123,
    ]),
  ],
};

await executeStep("modify-source-files", () =>
  cp(COPY_BASE, MODIFY_BASE, { recursive: true }).then(() =>
    Promise.all(
      Object.entries(MODIFICATIONS).map(([file, changes]) => {
        const from = join(COPY_BASE, `${file}.txt`);
        const to = join(MODIFY_BASE, `${file}.txt`);

        return readFile(from, "utf-8")
          .then((content) => {
            const lines = content.split(/\r?\n/);

            const inserts = [];

            for (const change of changes) {
              if ("insert" in change) {
                inserts.push(change);
                continue;
              }
              const idx = change.line - 1;
              if (lines[idx] === undefined)
                throw new Error(
                  `Line ${change.line} in ${from} does not exist."`
                );
              if (lines[idx].trim() !== change.before)
                throw new Error(
                  `Line ${change.line} in ${from} does not contain expected text "${change.before}". Original: "${lines[idx]}"`
                );

              if (change.delete) lines[idx] = DELETE_MARKER;
              else lines[idx] = change.after;
            }

            let resultLines = lines;

            // Apply inserts in descending order so indices stay valid
            for (const { line, insert } of inserts.sort(
              (a, b) => b.line - a.line
            ))
              resultLines.splice(line - 1, 0, insert);

            resultLines = resultLines.filter((line) => line !== DELETE_MARKER);

            return writeFile(to, resultLines.join("\r\n"), "utf-8");
          })
          .catch((error) => logger.error({ from, to, error }));
      })
    )
  )
);
