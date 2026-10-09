import { describe, expect, it } from "vitest";
import {
  creditKobo,
  paystackFeeEstimateKobo,
  paystackTransferCostKobo,
  stampDutyKobo,
  totalDepositFeeKobo,
  withdrawalFeeKobo,
} from "./fees.js";

const naira = (value: number) => Math.round(value * 100);

describe("deposit fee estimates", () => {
  it.each([
    [1_000, 15],
    [2_000, 30],
    [2_499.99, 37.5],
    [2_500, 137.5],
    [5_000, 175],
    [10_000, 250],
    [100_000, 1_600],
    [200_000, 2_000],
  ])("estimates %s naira as %s naira", (amount, fee) => {
    expect(paystackFeeEstimateKobo(naira(amount))).toBe(naira(fee));
  });

  it.each([
    [1_000, 25, 975],
    [5_000, 185, 4_815],
    [100_000, 1_610, 98_390],
  ])("quotes %s naira", (amount, fee, credit) => {
    expect(totalDepositFeeKobo(naira(amount))).toBe(naira(fee));
    expect(creditKobo(naira(amount))).toBe(naira(credit));
  });
});

describe("withdrawal fee estimates", () => {
  it.each([
    [500, 25],
    [5_000, 25],
    [5_001, 40],
    [9_999, 40],
    [10_000, 90],
    [50_000, 90],
    [50_001, 115],
  ])("quotes %s naira as %s naira", (amount, fee) => {
    expect(withdrawalFeeKobo(naira(amount))).toBe(naira(fee));
  });

  it("keeps transfer cost and stamp duty separate", () => {
    expect(paystackTransferCostKobo(naira(5_001))).toBe(2_500);
    expect(stampDutyKobo(naira(10_000))).toBe(5_000);
  });
});
