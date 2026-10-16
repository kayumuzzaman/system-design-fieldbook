// Prints the fee for a car and a van for stays of 0 to 30 whole hours, as JSON. The chapter's chart is drawn from this.
import { hourly, standardPricing } from "./pricing.ts";

const uncapped = hourly({ motorcycle: 100, car: 300, van: 500 });
const rows = Array.from({ length: 31 }, (_, hours) => ({
  hours,
  car: standardPricing("car", hours * 60),
  van: standardPricing("van", hours * 60),
  carWithoutCap: uncapped("car", hours * 60),
}));
console.log(JSON.stringify(rows));
