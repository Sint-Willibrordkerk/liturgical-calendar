import dotenv from "dotenv";
import { join } from "path";

dotenv.config();

const DIVINUM_OFFICIUM_BASE = join(
  process.env.DIVINUM_OFFICIUM_BASE,
  "web/www"
);
const PROJECT_BASE = process.cwd();

export const SOURCE_DIRS = {
  Sancti: [
    join(DIVINUM_OFFICIUM_BASE, "missa/Latin/Sancti"),
    join(DIVINUM_OFFICIUM_BASE, "horas/Latin/Sancti"),
  ],
  SanctiM: [join(DIVINUM_OFFICIUM_BASE, "horas/Latin/SanctiM")],
  Tempora: [
    join(DIVINUM_OFFICIUM_BASE, "missa/Latin/Tempora"),
    join(DIVINUM_OFFICIUM_BASE, "horas/Latin/Tempora"),
  ],
  Commune: [
    join(DIVINUM_OFFICIUM_BASE, "missa/Latin/Commune"),
    join(DIVINUM_OFFICIUM_BASE, "horas/Latin/Commune"),
  ],
  CommuneCist: join(DIVINUM_OFFICIUM_BASE, "horas/Latin/CommuneCist"),
  CommuneM: join(DIVINUM_OFFICIUM_BASE, "horas/Latin/CommuneM"),
  Psalterium: join(DIVINUM_OFFICIUM_BASE, "horas/Latin/Psalterium"),
  "Psalterium/Common": join(
    DIVINUM_OFFICIUM_BASE,
    "horas/Latin/Psalterium/Common"
  ),
  "Psalterium/Psalmi": join(
    DIVINUM_OFFICIUM_BASE,
    "horas/Latin/Psalterium/Psalmi"
  ),
  "Psalterium/Special": join(
    DIVINUM_OFFICIUM_BASE,
    "horas/Latin/Psalterium/Special"
  ),
};

export const OUTPUT_BASE = join(PROJECT_BASE, "assets/divinum-officium");

export const STANDARD_ENDINGS = {
  "$Per Dominum": "per-dominum", // "Per Dóminum nostrum Jesum Christum, Fílium tuum: qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
  "$Qui tecum": "qui-tecum", // "Qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
  "$Qui vivis": "qui-vivis", // "Qui vivis et regnas cum Deo Patre in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
  "$Per eundem": "per-eundem", // "Per eundem Dóminum nostrum Jesum Christum, Fílium tuum: qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
};

export const FILE_FILTER = (file) => !file.endsWith("pl.txt");
