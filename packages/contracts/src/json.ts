import { z } from "zod/v3";

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

const recursiveJson: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(recursiveJson).readonly(), z.record(recursiveJson).readonly()]),
);

// Keep the validated snapshot, not z.record's output (v3 drops own __proto__ keys).
export const jsonValueSchema = z.custom<JsonValue>((value) => recursiveJson.safeParse(value).success);
