import dotenv from "dotenv";
import { join } from "path";

dotenv.config();

export const DIVINUM_OFFICIUM_BASE = join(
  process.env.DIVINUM_OFFICIUM_BASE,
  "web/www"
);
const PROJECT_BASE = process.cwd();

export const SOURCE_DIRS = [
  "missa/Latin/Sancti",
  "horas/Latin/Sancti",
  "horas/Latin/SanctiM",
  "missa/Latin/Tempora",
  "horas/Latin/Tempora",
  "missa/Latin/Commune",
  "horas/Latin/Commune",
  "horas/Latin/CommuneCist",
  "horas/Latin/CommuneM",
  "horas/Latin/Psalterium",
  "horas/Latin/Psalterium/Common",
  "horas/Latin/Psalterium/Psalmi",
  "horas/Latin/Psalterium/Special",
];

export const STEP_BASE = join(PROJECT_BASE, ".divinum-officium");
export const COPY_BASE = join(STEP_BASE, "copy-source-files");
export const MODIFY_BASE = join(STEP_BASE, "modify-source-files");
export const MIGRATION_BASE = join(
  PROJECT_BASE,
  ".divinum-officium/initial-migration"
);
export const RESOLVE_REFERENCES_BASE = join(
  PROJECT_BASE,
  ".divinum-officium/resolve-references"
);

export const STANDARD_ENDINGS = {
  "$Per Dominum": "per-dominum", // "Per Dóminum nostrum Jesum Christum, Fílium tuum: qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
  "$Qui tecum": "qui-tecum", // "Qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
  "$Qui vivis": "qui-vivis", // "Qui vivis et regnas cum Deo Patre in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
  "$Per eundem": "per-eundem", // "Per eundem Dóminum nostrum Jesum Christum, Fílium tuum: qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. Amen.",
};

export const FILE_FILTER = (file) =>
  file.endsWith(".txt") &&
  !file.endsWith("pl.txt") &&
  !file.endsWith("tts.txt");
