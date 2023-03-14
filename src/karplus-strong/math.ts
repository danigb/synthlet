/**
 * Bound a value to min and max limits
 */
export function boundValue(
  value: number,
  minValue: number,
  maxValue: number
): number {
  const t = value < minValue ? minValue : value;
  return t > maxValue ? maxValue : t;
}

/**
 * Bound a value to [0, +1]
 */
export function boundValueUnipolar(value: number) {
  return boundValue(value, 0.0, 1.0);
}

/**
 * Bound a value to [-1, +1]
 */
export function boundValueBipolar(value: number) {
  return boundValue(value, -1.0, 1.0);
}
