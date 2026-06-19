import { describe, it, expect } from "vitest";
import { classifyStage, normalizeSource } from "@/lib/ghl-pipeline";

describe("classifyStage — lifecycle classification (real EcoSphere stage names)", () => {
  const cases: [string, string][] = [
    // dead — checked before everything else
    ["Unqualified/Dead lead", "dead"],
    ["Gone Cold (Pre-Quote)", "dead"],
    ["❌Quoted:  Lost / Not Proceeding", "dead"],
    // post-sale
    ["🔧 Install Complete – Aftercare Due", "postsale"],
    ["♻️ Service Plan / Ongoing Customer", "postsale"],
    // won / in-progress (won wins over the broad "quote" net)
    ["✅ Accepted – Install Pending", "won"],
    ["Deposit Received", "won"],
    ["Quote Accepted", "won"],
    // engaged
    ["📞 Contacted –  Engaged", "engaged"],
    ["📋 Survey Required (Not Booked)", "engaged"],
    ["📅 Survey Booked", "engaged"],
    ["💷 Proposal Sent", "engaged"],
    ["Quote Sent", "engaged"],
    // inbound — never engaged
    ["🆕 New Enquiry (Uncontacted)", "inbound"],
    ["Contact attempt 1", "inbound"],
    ["Contact Attempted", "inbound"],
    ["No contact - Follow up sent", "inbound"],
    ["New Lead", "inbound"],
    // nurture
    ["Nurture", "nurture"],
    // unknown → conservative inbound
    ["Some brand new stage", "inbound"],
  ];

  it.each(cases)("%s → %s", (name, expected) => {
    expect(classifyStage(name)).toBe(expected);
  });

  it("does not misread 'Contact Attempted' as engaged via 'contacted'", () => {
    expect(classifyStage("Contact Attempted")).toBe("inbound");
  });
});

describe("normalizeSource", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeSource("  Direct   approach ")).toBe("Direct approach");
  });
  it("falls back to Unknown for empty / non-string", () => {
    expect(normalizeSource("")).toBe("Unknown");
    expect(normalizeSource("   ")).toBe("Unknown");
    expect(normalizeSource(null)).toBe("Unknown");
    expect(normalizeSource(undefined)).toBe("Unknown");
    expect(normalizeSource(42)).toBe("Unknown");
  });
  it("groups casing variants under one key (lowercased)", () => {
    expect(normalizeSource("Direct approach").toLowerCase()).toBe(normalizeSource("Direct Approach").toLowerCase());
  });
  it("preserves a normal source label", () => {
    expect(normalizeSource("Facebook advertising")).toBe("Facebook advertising");
  });
  it("collapses tracking URLs to their host (so query strings don't each split)", () => {
    expect(normalizeSource("https://portal.reonic.de/resolve?type=H360Request&id=abc")).toBe("portal.reonic.de");
    expect(normalizeSource("https://www.example.com/x")).toBe("example.com");
    expect(normalizeSource("not a url, just text")).toBe("not a url, just text");
  });
});
