import dotenv from "dotenv";
import { parseArgs } from "util";
import { consola } from "consola";
import { runPipeline } from "./pipeline";

dotenv.config();

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: "0" },
      to: { type: "string", default: "11" },
      step: { type: "string" },
      force: { type: "boolean", short: "f", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    consola.log(`
Pipeline - Convert Divinum Officium sources to structured YAML

Steps 0-6 stream in-memory; steps 7-11 are directory-level batch passes that
read the materialized step{N-1} folder.

Usage: tsx convert-do/index.ts [options]

Options:
  --from <step>     Start from step N (0-11, default: 0)
  --to <step>       Process up to step N (0-11, default: 11)
  --step <step>     Process only step N (shorthand for --from N --to N)
  -f, --force       Clean output folder and process all files (default: only process missing outputs)
  -h, --help        Show this help

Examples:
  tsx convert-do/index.ts                 # Full pipeline, output in step11/
  tsx convert-do/index.ts --to 5          # Steps 0-5, output in step5/
  tsx convert-do/index.ts --from 7 --to 11 # Batch steps 7-11 (reads step6/)
  tsx convert-do/index.ts --step 6        # Only step 6, output in step6/
`);
    process.exit(0);
  }

  let fromStep, toStep;

  if (values.step) {
    const step = parseInt(values.step, 10);
    if (isNaN(step) || step < 0 || step > 11) {
      consola.error(`Invalid --step value: ${values.step}. Must be 0-11.`);
      process.exit(1);
    }
    fromStep = step;
    toStep = step;
  } else {
    fromStep = parseInt(values.from, 10);
    toStep = parseInt(values.to, 10);

    if (isNaN(fromStep) || fromStep < 0 || fromStep > 11) {
      consola.error(`Invalid --from value: ${values.from}. Must be 0-11.`);
      process.exit(1);
    }
    if (isNaN(toStep) || toStep < 0 || toStep > 11) {
      consola.error(`Invalid --to value: ${values.to}. Must be 0-11.`);
      process.exit(1);
    }
    if (fromStep > toStep) {
      consola.error(
        `--from (${fromStep}) cannot be greater than --to (${toStep}).`
      );
      process.exit(1);
    }
  }

  return {
    fromStep,
    toStep,
    force: !!values.force,
  };
}

async function main() {
  const args = parseCliArgs();
  await runPipeline(args.fromStep, args.toStep, args.force).catch((err) => {
    consola.error("Pipeline error:", err);
    process.exit(1);
  });
}

main();
