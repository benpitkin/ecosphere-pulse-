import type { Liability } from "./types";
import { getBalanceSheetIndex } from "./xero";

const COT_REMNANT = 0; // Capital on Tap fully cleared (refinanced to Funding Circle).

// TODO: port real mapping from the Xero balance sheet. See docs/HANDOVER.md §5/§7.
export async function getLiabilities(): Promise<Liability[]> {
  const { lines } = await getBalanceSheetIndex();
  const items: Liability[] = [{ name: "Funding Circle loan", amount: 55588 }];
  if (COT_REMNANT > 0) items.push({ name: "Capital on Tap", amount: COT_REMNANT });
  void lines;
  return items;
}
