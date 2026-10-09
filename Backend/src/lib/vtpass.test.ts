import { describe, expect, it } from "vitest";
import { classifyVtpassResponse, generateProviderRequestId } from "./vtpass.js";

describe("VTpass response classification", () => {
  it("classifies every documented definite failure code", () => {
    for (const code of ["016", "091", "010", "011", "012", "013", "017", "018", "019", "021", "022", "023", "024", "027", "028", "030", "034", "035", "085", "087"]) {
      expect(classifyVtpassResponse(code, "failed")).toBe("FAILED");
    }
  });
  it("keeps unclear and retryable responses pending", () => {
    for (const code of ["099", "089", "014", "015", "999", undefined]) {
      expect(classifyVtpassResponse(code, "unknown")).toBe("PENDING");
    }
  });
  it("handles delivered and reversed statuses", () => {
    expect(classifyVtpassResponse("000", "delivered")).toBe("DELIVERED");
    expect(classifyVtpassResponse("040", "failed")).toBe("REVERSED");
    expect(classifyVtpassResponse("000", "reversed")).toBe("REVERSED");
  });
});

describe("VTpass request IDs", () => {
  it("uses Lagos time across a UTC/Lagos midnight boundary", () => {
    const before = generateProviderRequestId(new Date("2026-01-01T22:59:00.000Z"));
    const after = generateProviderRequestId(new Date("2026-01-01T23:01:00.000Z"));
    expect(before.slice(0, 12)).toBe("202601012359");
    expect(after.slice(0, 12)).toBe("202601020001");
    expect(before).toMatch(/^\d{12}[a-f0-9]{16}$/);
  });
});
