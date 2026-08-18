import { cap, type SpendLimit, type CapOptions } from "../spend";
import { type LlmMeter } from "../meter";

export type Request = {
  [key: string]: any;
};

export type Response = {
  status: (code: number) => Response;
  json: (body: any) => void;
  [key: string]: any;
};

export type NextFunction = (err?: any) => void;

export type ExpressBudgetMiddlewareOptions = {
  maxCostUsd?: number;
  maxTokens?: number;
  meter?: LlmMeter;
  onLimitExceeded?: (err: Error, req: Request, res: Response, next: NextFunction) => void;
};

export interface RequestWithBudget extends Request {
  llmBudget?: SpendLimit;
}

export function createExpressBudgetMiddleware(opts: ExpressBudgetMiddlewareOptions = {}) {
  return (req: RequestWithBudget, res: Response, next: NextFunction) => {
    const capOpts: CapOptions = {};
    if (opts.maxCostUsd !== undefined) capOpts.maxCostUsd = opts.maxCostUsd;
    if (opts.maxTokens !== undefined) capOpts.maxTokens = opts.maxTokens;
    if (opts.meter !== undefined) capOpts.meter = opts.meter;

    const budget = cap(capOpts);

    req.llmBudget = budget;

    budget
      .run(async () => {
        // Continue execution of downstream middleware / routes
        next();
      })
      .catch((err) => {
        if (opts.onLimitExceeded) {
          opts.onLimitExceeded(err, req, res, next);
        } else {
          res.status(402).json({
            error: err.name || "BudgetLimitExceeded",
            message: err.message || "LLM usage limit exceeded for this request."
          });
        }
      });
  };
}

