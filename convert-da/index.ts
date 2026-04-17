import dotenv from "dotenv";
import { parseArgs } from "util";
import { consola } from "consola";
import { runPipeline } from "./pipeline";

dotenv.config();

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: "0" },
      to: { type: "string", default: "13" },
      step: { type: "string" },
      force: { type: "boolean", short: "f", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    consola.log(`
Pipeline - Process files in streaming mode (in-memory, no intermediate files)

Usage: node pipeline.mjs [options]

Options:
  --from <step>     Start from step N (0-13, default: 0)
  --to <step>       Process up to step N (0-13, default: 13)
  --step <step>     Process only step N (shorthand for --from N --to N)
  -f, --force       Clean output folder and process all files (default: only process missing outputs)
  -h, --help        Show this help

Examples:
  node pipeline.mjs                    # Full pipeline, output in step13/
  node pipeline.mjs --to 5             # Steps 1-5, output in step5/
  node pipeline.mjs --from 4 --to 8    # Steps 4-8, output in step8/
  node pipeline.mjs --step 7           # Only step 7, output in step7/
`);
    process.exit(0);
  }

  let fromStep, toStep;

  if (values.step) {
    const step = parseInt(values.step, 10);
    if (isNaN(step) || step < 0 || step > 13) {
      consola.error(`Invalid --step value: ${values.step}. Must be 0-13.`);
      process.exit(1);
    }
    fromStep = step;
    toStep = step;
  } else {
    fromStep = parseInt(values.from, 10);
    toStep = parseInt(values.to, 10);

    if (isNaN(fromStep) || fromStep < 0 || fromStep > 13) {
      consola.error(`Invalid --from value: ${values.from}. Must be 0-13.`);
      process.exit(1);
    }
    if (isNaN(toStep) || toStep < 0 || toStep > 13) {
      consola.error(`Invalid --to value: ${values.to}. Must be 0-13.`);
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
