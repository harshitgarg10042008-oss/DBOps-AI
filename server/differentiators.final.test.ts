import { describe, expect, it } from "vitest";
import { buildBlastRadius, checkContract, costGuard, fingerprintSql, semanticSimilarity } from "./differentiators";
import type { Catalog } from "./postgres";

const catalog = {
  tables: [{ name: "public.orders", columns: [{ name: "id", dataType: "integer", nullable: false }] }],
  relationships: [{ fromTable: "public.orders", fromColumn: "customer_id", toTable: "public.customers", toColumn: "id" }],
  indexes: [{ name: "orders_customer_idx", definition: "CREATE INDEX ON public.orders (customer_id)" }],
  views: [{ name: "public.orders_view", definition: "SELECT * FROM public.orders" }],
  constraints: [],
} as Catalog;

describe("differentiator hardening", () => {
  it("builds explicit blast-radius nodes and edges from observed metadata", () => {
    const result = buildBlastRadius(catalog, "public.orders");
    expect(result.nodes.map(node => node.id)).toEqual(expect.arrayContaining(["public.orders", "public.customers", "orders_customer_idx", "public.orders_view"]));
    expect(result.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "public.orders", to: "public.customers", type: "foreign_key" }),
      expect.objectContaining({ from: "public.orders", to: "orders_customer_idx", type: "index" }),
    ]));
  });

  it("normalizes query fingerprints without changing query structure", () => {
    expect(fingerprintSql("SELECT * FROM orders WHERE id = 42")).toBe("select * from orders where id = ?");
    expect(fingerprintSql("SELECT * FROM orders WHERE id = 99")).toBe("select * from orders where id = ?");
  });

  it("requires review for high-cost or large-row plans", () => {
    const result = costGuard({ totalCost: 12000, planRows: 150000, nodeType: "Seq Scan" });
    expect(result.status).toBe("review");
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps contract checks evidence-bound", () => {
    expect(checkContract(catalog, { table: "public.orders", columns: [{ name: "id", dataType: "integer" }] }).status).toBe("pass");
    expect(checkContract(catalog, { table: "public.orders", columns: [{ name: "missing_column" }] }).status).toBe("violation");
  });

  it("only considers semantically similar approved-pattern candidates", () => {
    expect(semanticSimilarity("orders by customer", "orders by customer")).toBe(1);
    expect(semanticSimilarity("orders by customer", "inventory by warehouse")).toBeLessThan(0.5);
  });
});
