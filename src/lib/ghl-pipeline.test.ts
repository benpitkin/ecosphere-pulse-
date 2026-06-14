import { describe, it, expect } from "vitest";
import { classifyStage } from "@/lib/ghl-pipeline";

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
