export type TimeProvider = () => Date;

export const systemTimeProvider: TimeProvider = () => new Date();

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export const InvalidTimeParameter = Symbol("InvalidTimeParameter");
export const InvalidTimeOrder = Symbol("InvalidTimeOrder");
export const TimeRangeTooLarge = Symbol("TimeRangeTooLarge");

export function parseTimeWindow(
  from: string,
  to: string,
  maxRangeDays: number,
) {
  try {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (fromDate >= toDate) {
      return InvalidTimeOrder;
    }

    if (toDate.getTime() - fromDate.getTime() > maxRangeDays * DAY_MS) {
      return TimeRangeTooLarge;
    }

    return { from: fromDate, to: toDate };
  } catch {
    return InvalidTimeParameter;
  }
}

export function calculateTimeBucketBounds(window: { from: Date; to: Date }) {
  const fromMs = window.from.getTime();
  const toMs = window.to.getTime();
  const hourFromMs = Math.ceil(fromMs / HOUR_MS) * HOUR_MS;
  const hourToMs = Math.floor(toMs / HOUR_MS) * HOUR_MS;
  const dayFromMs = Math.ceil(hourFromMs / DAY_MS) * DAY_MS;
  const dayToMs = Math.floor(hourToMs / DAY_MS) * DAY_MS;

  return {
    dayFrom: new Date(dayFromMs).toISOString(),
    dayTo: new Date(dayToMs).toISOString(),
    hourFrom: new Date(hourFromMs).toISOString(),
    hourTo: new Date(hourToMs).toISOString(),
  };
}
