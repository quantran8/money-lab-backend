import { TransformFnParams } from 'class-transformer';
import { ValidateBy, ValidationOptions } from 'class-validator';

/**
 * Transforms object values to numbers (for JSON body where values may be strings).
 */
export function transformKeysToNumbers({
  value,
}: TransformFnParams): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const out: Record<string, number> = {};

  for (const [k, v] of Object.entries(value)) {
    const n = Number(v);
    out[k] = Number.isNaN(n) ? 0 : n;
  }

  return out;
}

export function transformRecordToNumbers({ value }: TransformFnParams) {
  if (!value || typeof value !== 'object') return {};

  const result: Record<number, number> = {};

  for (const [key, val] of Object.entries(value)) {
    result[Number(key)] = Number(val);
  }

  return result;
}

/**
 * Validates that value is a plain object and every value is a number.
 */
export function IsRecordOfNumbers(validationOptions?: ValidationOptions) {
    return ValidateBy(
        {
            name: 'isRecordOfNumbers',
            validator: {
                validate(value: unknown) {
                    if (typeof value !== 'object' || value === null || Array.isArray(value))
                        return false;
                    return Object.values(value).every(
                        (v) => typeof v === 'number' && !Number.isNaN(v),
                    );
                },
                defaultMessage: () => 'Each value must be a number',
            },
        },
        validationOptions,
    );
}
