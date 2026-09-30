import mongoose from 'mongoose';

// Caught values are `unknown`; these narrow them to the two error shapes the
// routes actually inspect, instead of reading properties off an `any`.

/** A MongoDB E11000 unique-index violation. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}

/** A mongoose schema validation failure, with per-field messages. */
export function isValidationError(error: unknown): error is mongoose.Error.ValidationError {
  return error instanceof mongoose.Error.ValidationError;
}
