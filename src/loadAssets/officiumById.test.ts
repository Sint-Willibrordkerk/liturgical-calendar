import { beforeAll, describe, expect, it } from "vitest";
import { loadMassPropersById, loadOfficiumById } from "./index";
import { NO_LANGUAGE, type Language } from "../language";

/**
 * The Office of a day is published beside its Mass, in the same file and
 * holding keys alike; the calendar reads it Hour by Hour.
 */
describe("the Office of a day, in a language", () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).bundledAssets = {
      "mass-propers/Sancti/agnetis-virginis-et-martyris.yml": {
        title: "S. Agnetis Virginis et Martyris",
        name: "agnetis",
        oratio: "omnipotens-1",
        lectio: "eccli-51-1-8",
        "ant-1": "beata-agnes-1",
        "versum-1": "specie-tua-1",
        invit: "regem-virginum-1",
        "hymnus-matutinum": "jesu-corona-1",
        "ant-matutinum": "discede-a-me-1",
        "nocturn-1-versum": "specie-tua-1",
        lectio1: "1-cor-7-25-31",
        responsory1: "diem-festum-1",
        lectio2: "1-cor-7-32-35",
        lectio4: "lib-1-de-virg-3",
        responsory4: "amo-christum-1",
        lectio94: "liber-1-post-initium-2",
        "ant-laudes": "haec-est-virgo-1",
        "capitulum-laudes": "sir-51-1-3",
        "versum-2": "diffusa-est-1",
        "ant-2": "ecce-quod-1",
        "lectio-prima": "sir-51-13-14",
        "capitulum-sexta": "sir-51-4-5",
        "responsory-breve-sexta": "specie-tua-2",
        "ant-vespera": "haec-est-virgo-1",
        "hymnus-vespera": "jesu-corona-1",
        "versum-3": "diffusa-est-1",
        "ant-3": "stans-beata-1",
      },
      "mass-propers/Sancti/pauli-primi-eremitae.yml": {
        title: "S. Pauli Primi Eremitæ",
        name: "pauli",
        oratio: "deus-qui-1",
        "ant-1": "beata-agnes-1",
      },
      // Christmas has three Masses and one Office, which the sources keep with
      // the first.
      "mass-propers/Sancti/in-nativitate-domini.yml": {
        title: "In Nativitate Domini",
        oratio: "deus-qui-1",
        "ant-2": "ecce-quod-1",
      },
      "mass-propers/Sancti/in-die-nativitatis-domini.yml": {
        title: "In die Nativitatis Domini",
        oratio: "omnipotens-1",
        introitus: "puer-natus-1",
      },
      "mass-propers/Tempora/feria-iv-quattuor-temporum.yml": {
        title: "Feria IV Quattuor Temporum",
        "ant-2": [{ value: "ecce-quod-1" }, { value: "beata-agnes-1", condition: ["1570"] }],
      },
    };
  });

  const versicle = (versus: string) => ({ versus, responsum: "Inténde." });
  const latin: Language = {
    code: "la",
    assets: {
      masspropers: {
        lectio: {
          "eccli-51-1-8": { ref: "Eccli 51:1-8", verses: ["Confitébor tibi"] },
          "1-cor-7-25-31": { ref: "1 Cor 7:25-31", verses: ["De virgínibus"] },
          "1-cor-7-32-35": { ref: "1 Cor 7:32-35", verses: ["Volo autem vos"] },
          "lib-1-de-virg-3": { ref: "Lib. 1 de Virg.", text: "Natális est vírginis" },
          "liber-1-post-initium-2": { ref: "Liber 1", text: "Agnes Romána virgo" },
        },
        oratio: {
          "omnipotens-1": { text: "Omnípotens sempitérne Deus", closure: "Per Dominum" },
          "deus-qui-1": { text: "Deus, qui nos beáti N.", closure: "Per Dominum" },
        },
        antiphona: {
          "beata-agnes-1": { text: "Beáta Agnes * in médio flammárum." },
          "regem-virginum-1": { text: "Regem Vírginum Dóminum, * Veníte, adorémus." },
          "discede-a-me-1": { antiphonae: [{ text: "Discéde a me, * pábulum mortis.", psalmus: "1" }] },
          "haec-est-virgo-1": { antiphonae: [{ text: "Hæc est Virgo sápiens, * et una.", psalmus: "109" }] },
          "ecce-quod-1": { text: "Ecce, quod concupívi, * jam vídeo." },
          "stans-beata-1": { text: "Stans beáta Agnes * in médio flammæ." },
        },
        hymnus: { "jesu-corona-1": { strophae: [["Jesu, coróna Vírginum,"]] } },
        capitulum: {
          "sir-51-1-3": { ref: "Sir 51:1-3", text: "Confitébor tibi, Dómine, Rex." },
          "sir-51-13-14": { ref: "Sir 51:13-14", text: "Dómine, Deus meus." },
          "sir-51-4-5": { ref: "Sir 51:4-5", text: "Liberásti me." },
        },
        responsorium: {
          "diem-festum-1": { responsum: "Diem festum * Quia solum.", versus: "Infántia.", repetitio: "Quia solum." },
          "amo-christum-1": { responsum: "Amo Christum * Quem cum amávero.", versus: "Anulo.", repetitio: "Quem cum amávero." },
          "specie-tua-2": { responsum: "Spécie tua * Et pulchritúdine tua.", versus: "Inténde.", repetitio: "Et pulchritúdine tua." },
        },
        versus: {
          "specie-tua-1": versicle("Spécie tua et pulchritúdine tua."),
          "diffusa-est-1": versicle("Diffúsa est grátia in lábiis tuis."),
        },
        nomen: { agnetis: "Agnétis", pauli: "Pauli" },
      },
    },
  };

  it("reads the Office Hour by Hour", () => {
    expect(loadOfficiumById("agnetis-virginis-et-martyris", latin)).toEqual({
      primaeVesperae: {
        psalmodia: { antiphonae: [{ text: "Hæc est Virgo sápiens, * et una.", psalmus: "109" }] },
        hymnus: { strophae: [["Jesu, coróna Vírginum,"]] },
        versus: versicle("Spécie tua et pulchritúdine tua."),
        magnificat: { text: "Beáta Agnes * in médio flammárum." },
      },
      matutinum: {
        invitatorium: { text: "Regem Vírginum Dóminum, * Veníte, adorémus." },
        hymnus: { strophae: [["Jesu, coróna Vírginum,"]] },
        psalmodia: { antiphonae: [{ text: "Discéde a me, * pábulum mortis.", psalmus: "1" }] },
        nocturni: [
          {
            versus: versicle("Spécie tua et pulchritúdine tua."),
            lectiones: [
              {
                numerus: 1,
                lectio: { ref: "1 Cor 7:25-31", verses: ["De virgínibus"] },
                responsorium: { responsum: "Diem festum * Quia solum.", versus: "Infántia.", repetitio: "Quia solum." },
              },
              { numerus: 2, lectio: { ref: "1 Cor 7:32-35", verses: ["Volo autem vos"] } },
            ],
          },
          {
            lectiones: [
              {
                numerus: 4,
                lectio: { ref: "Lib. 1 de Virg.", text: "Natális est vírginis" },
                responsorium: {
                  responsum: "Amo Christum * Quem cum amávero.",
                  versus: "Anulo.",
                  repetitio: "Quem cum amávero.",
                },
              },
            ],
          },
        ],
        legenda: { ref: "Liber 1", text: "Agnes Romána virgo" },
      },
      laudes: {
        psalmodia: { antiphonae: [{ text: "Hæc est Virgo sápiens, * et una.", psalmus: "109" }] },
        capitulum: { ref: "Sir 51:1-3", text: "Confitébor tibi, Dómine, Rex." },
        versus: versicle("Diffúsa est grátia in lábiis tuis."),
        benedictus: { text: "Ecce, quod concupívi, * jam vídeo." },
      },
      prima: { lectioBrevis: { ref: "Sir 51:13-14", text: "Dómine, Deus meus." } },
      sexta: {
        capitulum: { ref: "Sir 51:4-5", text: "Liberásti me." },
        responsorium: { responsum: "Spécie tua * Et pulchritúdine tua.", versus: "Inténde.", repetitio: "Et pulchritúdine tua." },
      },
      vesperae: {
        psalmodia: { antiphonae: [{ text: "Hæc est Virgo sápiens, * et una.", psalmus: "109" }] },
        hymnus: { strophae: [["Jesu, coróna Vírginum,"]] },
        versus: versicle("Diffúsa est grátia in lábiis tuis."),
        magnificat: { text: "Stans beáta Agnes * in médio flammæ." },
      },
      oratio: { text: "Omnípotens sempitérne Deus", closure: "Per Dominum" },
    });
  });

  it("says at second Vespers what first Vespers says, where the day gives nothing else", () => {
    const officium = loadOfficiumById("pauli-primi-eremitae", latin);
    expect(officium!.primaeVesperae!.magnificat).toEqual({ text: "Beáta Agnes * in médio flammárum." });
    expect(officium!.vesperae!.magnificat).toEqual({ text: "Beáta Agnes * in médio flammárum." });
  });

  it("gives the saint's name where the common leaves it open", () => {
    expect(loadOfficiumById("pauli-primi-eremitae", latin)!.oratio).toEqual({
      text: "Deus, qui nos beáti Pauli",
      closure: "Per Dominum",
    });
  });

  it("reads Christmas's Office where the sources keep it, with the collect of the Mass of the day", () => {
    expect(loadOfficiumById("in-die-nativitatis-domini", latin)).toEqual({
      laudes: { benedictus: { text: "Ecce, quod concupívi, * jam vídeo." } },
      oratio: { text: "Omnípotens sempitérne Deus", closure: "Per Dominum" },
    });
  });

  it("takes the variant of the rubric in force", () => {
    expect(loadOfficiumById("feria-iv-quattuor-temporum", latin)).toEqual({
      laudes: { benedictus: { text: "Ecce, quod concupívi, * jam vídeo." } },
    });
  });

  it("leaves the Office out of the Mass", () => {
    expect(Object.keys(loadMassPropersById("agnetis-virginis-et-martyris", latin)!)).toEqual([
      "title",
      "name",
      "oratio",
      "lectio",
    ]);
  });

  it("has no Office without a language, or for a day with no Office", () => {
    expect(loadOfficiumById("agnetis-virginis-et-martyris", NO_LANGUAGE)).toBeUndefined();
    expect(loadOfficiumById("nemo", latin)).toBeUndefined();
  });

  describe("with fallback languages", () => {
    const dutch: Language = {
      code: "nl",
      assets: {
        masspropers: {
          oratio: {
            "omnipotens-1": { text: "Almachtige, eeuwige God", closure: "Door onze Heer" },
          },
          antiphona: {
            "haec-est-virgo-1": {
              antiphonae: [{ text: "Dit is de wijze maagd, * en één.", psalmus: "109" }],
            },
          },
          lectio: {
            "1-cor-7-25-31": { ref: "1 Kor 7:25-31", verses: ["Over de maagden"] },
          },
          nomen: { agnetis: "Agnes" },
        },
      },
    };
    const agnes = "agnetis-virginis-et-martyris";

    it("says what the language lacks in the fallback, and names it on the part that holds it", () => {
      const officium = loadOfficiumById(agnes, dutch, undefined, [], [latin])!;
      expect(officium.laudes).toEqual({
        psalmodia: { antiphonae: [{ text: "Dit is de wijze maagd, * en één.", psalmus: "109" }] },
        capitulum: { ref: "Sir 51:1-3", text: "Confitébor tibi, Dómine, Rex." },
        versus: { versus: "Diffúsa est grátia in lábiis tuis.", responsum: "Inténde." },
        benedictus: { text: "Ecce, quod concupívi, * jam vídeo." },
        fallback: { capitulum: "la", versus: "la", benedictus: "la" },
      });
      // The first lesson of Matins is Dutch; its responsory is not.
      const [first, second] = officium.matutinum!.nocturni![0]!.lectiones;
      expect(first).toMatchObject({
        lectio: { ref: "1 Kor 7:25-31" },
        responsorium: { responsum: "Diem festum * Quia solum." },
        fallback: { responsorium: "la" },
      });
      expect(second).toMatchObject({ fallback: { lectio: "la" } });
      // The collect is the Dutch one and so is not named.
      expect(officium.oratio).toEqual({ text: "Almachtige, eeuwige God", closure: "Door onze Heer" });
      expect(officium).not.toHaveProperty("fallback");
    });

    it("carries no marker where the language says the whole Office itself", () => {
      expect(JSON.stringify(loadOfficiumById(agnes, latin, undefined, [], [dutch]))).not.toContain(
        "fallback"
      );
    });

    it("leaves out what the language lacks when no fallback is given", () => {
      const officium = loadOfficiumById(agnes, dutch)!;
      expect(officium.laudes).toEqual({
        psalmodia: { antiphonae: [{ text: "Dit is de wijze maagd, * en één.", psalmus: "109" }] },
      });
      expect(JSON.stringify(officium)).not.toContain("fallback");
    });

    it("says an Office the language has nothing of wholly in the fallback", () => {
      const officium = loadOfficiumById(agnes, { code: "nl", assets: {} }, undefined, [], [latin])!;
      expect(officium.oratio).toEqual({ text: "Omnípotens sempitérne Deus", closure: "Per Dominum" });
      expect(officium.fallback).toEqual({ oratio: "la" });
      expect(officium.laudes!.fallback).toEqual({
        psalmodia: "la",
        capitulum: "la",
        versus: "la",
        benedictus: "la",
      });
    });
  });
});
