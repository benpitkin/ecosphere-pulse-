import { describe, it, expect } from "vitest";
import { buildLiabilities } from "@/lib/liabilities";

const find = (r: ReturnType<typeof buildLiabilities>, label: RegExp) => r.items.find((i) => label.test(i.label));

describe("buildLiabilities", () => {
  it("always includes the off-Xero Funding Circle loan and corporation tax", () => {
    const r = buildLiabilities({});
    expect(find(r, /Funding Circle/)?.amount).toBe(55588);
    expect(find(r, /Corporation tax/)?.group).toBe("hmrc");
    // with no Xero lines, totals are just those two
    expect(r.lenderTotal).toBe(55588);
    expect(r.hmrcTotal).toBe(13000);
  });

  it("takes the magnitude of liability lines (stored negative on the balance sheet)", () => {
    const r = buildLiabilities({ "british airways american expre": -1500, "hire purchase - gl18nld": -8200 });
    expect(find(r, /Amex/)?.amount).toBe(1500);
    expect(find(r, /Vehicle hire purchase/)?.amount).toBe(8200);
    expect(r.lenderTotal).toBe(55588 + 1500 + 8200);
  });

  it("groups PAYE and CIS under HMRC and sums them with corporation tax", () => {
    const r = buildLiabilities({ "paye payable": -3200, "cis liability": -900 });
    expect(find(r, /PAYE/)?.group).toBe("hmrc");
    expect(find(r, /CIS/)?.group).toBe("hmrc");
    expect(r.hmrcTotal).toBe(13000 + 3200 + 900);
  });

  it("omits zero-balance lines", () => {
    const r = buildLiabilities({ "british airways american expre": 0, "paye payable": 0 });
    expect(find(r, /Amex/)).toBeUndefined();
    expect(find(r, /PAYE/)).toBeUndefined();
  });

  it("treats a credit VAT balance as a reclaim note, not a debt in the totals", () => {
    const r = buildLiabilities({ vat: -2877 });
    const vat = find(r, /^VAT$/);
    expect(vat?.group).toBe("note");
    expect(vat?.amount).toBe(2877);
    // notes never feed the lender/HMRC totals
    expect(r.lenderTotal).toBe(55588);
    expect(r.hmrcTotal).toBe(13000);
  });

  it("surfaces the director's loan account as a note (the pre-refinance CoT remnant)", () => {
    const r = buildLiabilities({ "directors' loan account": 51644 });
    const dla = find(r, /Director's loan/);
    expect(dla?.group).toBe("note");
    expect(dla?.amount).toBe(51644);
    expect(r.lenderTotal).toBe(55588); // note excluded from totals
  });
});
