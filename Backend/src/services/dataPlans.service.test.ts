import { describe, expect, it } from "vitest";
import { amountNairaToKobo, findDataPlan, parseDataPlans, refreshAvailableDataServices, serviceIdsForNetwork } from "./dataPlans.service.js";
import type { BillProvider } from "../lib/vtpass.js";

const plan = (variation_code: string, name: string, variation_amount: string, fixedPrice = "Yes") => ({ variation_code, name, variation_amount, fixedPrice });

describe("data plan parsing", () => {
  it("converts decimal naira strings to exact kobo without floating point", () => {
    expect(amountNairaToKobo("49.99")).toBe(4999);
    expect(amountNairaToKobo("1499.01")).toBe(149901);
    expect(amountNairaToKobo("99")).toBe(9900);
    expect(amountNairaToKobo("100000.00")).toBe(10_000_000);
    expect(amountNairaToKobo("1,000.00")).toBeNull();
  });

  it("drops every ambiguous duplicate and voice bundle from the MTN catalog", () => {
    const parsed = parseDataPlans("mtn-data", { content: { variations: [
      plan("mtn-xtratalk-300", "MTN N200 Xtratalk", "200.00"),
      plan("mtn-xtratalk-300", "MTN N200 Xtratalk - 3 days", "200.00"),
      plan("mtn-10mb-100", "N100 100MB - 24 hrs", "100.00"),
      plan("mtn-talk-20", "20 talk minutes", "20.00"),
    ] } });
    expect(parsed.plans.map((item) => item.variationCode)).toEqual(["mtn-10mb-100"]);
    expect(parsed.duplicateCodes).toEqual(["mtn-xtratalk-300"]);
    expect(parsed.droppedVoice).toBe(1);
    expect(parsed.plans[0]).toMatchObject({ sizeLabel: "100MB", validityLabel: "24 hrs", validityBucket: "daily", kind: "STANDARD" });
  });

  it("uses variations without merging the misspelled fallback and excludes non-fixed plans", () => {
    const parsed = parseDataPlans("airtel-data", { content: {
      variations: [
        plan("airt-200", "Airtel Data 200 Naira - 200MB - 3Days", "199.03"),
        plan("airt-voice-600", "600 Naira Voice Bundle", "100.00"),
        plan("airt-variable", "Airtel Data variable price", "99.00", "No"),
      ],
      varations: [plan("airt-duplicate-copy", "Should not merge", "1.00")],
    } });
    expect(parsed.plans).toHaveLength(1);
    expect(parsed.plans[0]).toMatchObject({ amountKobo: 19903, validityBucket: "weekly", kind: "STANDARD" });
    expect(parsed.droppedVoice).toBe(1);
  });

  it("classifies Glo SME plans separately and rejects services absent from VTpass availability", () => {
    const parsed = parseDataPlans("glo-sme-data", { content: { varations: [
      plan("glo-dg-320", "Glo Data (SME) N320 - 1GB 30 days", "320.00"),
    ] } });
    expect(parsed.plans[0]).toMatchObject({ kind: "SME", planId: "glo-sme-data|glo-dg-320", validityBucket: "monthly" });
    expect(serviceIdsForNetwork("etisalat", new Set(["etisalat-data"]))).toEqual(["etisalat-data"]);
    expect(serviceIdsForNetwork("etisalat", new Set(["etisalat-data", "9mobile-sme-data"]))).toContain("9mobile-sme-data");
  });

  it("rejects a plan ID whose service belongs to a different selected network", async () => {
    const provider: BillProvider = {
      listServices: async () => [{ serviceID: "mtn-data", name: "MTN Data" }],
      listPlans: async () => ({ content: { variations: [plan("mtn-10mb-100", "N100 100MB - 24 hrs", "100.00")] } }),
      buy: async () => ({}), requery: async () => ({}), balance: async () => ({}),
    };
    await refreshAvailableDataServices(provider);
    expect(await findDataPlan("airtel-data|airt-50", "mtn", provider)).toBeNull();
  });
});
