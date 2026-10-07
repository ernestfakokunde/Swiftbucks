import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type RequestPart = "body" | "params" | "query";

export function validate(
  schemas: Partial<Record<RequestPart, ZodType>>,
): RequestHandler {
  return (req, res, next) => {
    for (const part of ["body", "params", "query"] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (!result.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: result.error.flatten(),
        });
      }

      req[part] = result.data;
    }

    return next();
  };
}
