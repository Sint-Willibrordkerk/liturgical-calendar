import { z } from "zod";
import type { Sanctorum } from "../../types";
import { sanctorumTypes } from "../../constants";
import { maybeArraySchema as zMaybeArray } from "./utils";

export const sanctorumSchema: z.ZodType<Sanctorum> = z.record(
  z.string(),
  z.object({
    titles: zMaybeArray(z.string()).optional(),
    type: z.enum(sanctorumTypes).optional(),
  })
);

export function assertSanctorum(
  sanctorum: any
): asserts sanctorum is Sanctorum {
  sanctorumSchema.parse(sanctorum);
}
