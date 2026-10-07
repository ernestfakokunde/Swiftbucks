import type {
  NextFunction,
  RequestHandler,
} from "express";
import type { ParamsDictionary } from "express-serve-static-core";
import type { ParsedQs } from "qs";

export function asyncHandler<
  P extends ParamsDictionary = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery extends ParsedQs = ParsedQs,
>(handler: RequestHandler<P, ResBody, ReqBody, ReqQuery>): RequestHandler<
  P,
  ResBody,
  ReqBody,
  ReqQuery
> {
  return (req, res, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
