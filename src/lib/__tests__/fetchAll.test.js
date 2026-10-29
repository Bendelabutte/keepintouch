import { describe, it, expect } from "vitest";
import { fetchAllRows } from "../fetchAll";

// Faux query builder Supabase : seule la méthode range() est utilisée.
const fakeTable = (total, serverMax = Infinity) => {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls = [];
  const build = () => ({
    range: async (from, to) => {
      calls.push([from, to]);
      const end = Math.min(to + 1, from + serverMax);
      return { data: rows.slice(from, end), error: null };
    },
  });
  return { build, calls };
};

describe("fetchAllRows", () => {
  it("récupère plus de 1000 lignes en plusieurs pages", async () => {
    const t = fakeTable(2345);
    const { data, error } = await fetchAllRows(t.build);
    expect(error).toBeNull();
    expect(data).toHaveLength(2345);
    expect(t.calls[0]).toEqual([0, 999]);
    expect(t.calls[1]).toEqual([1000, 1999]);
  });

  it("reste complet si le serveur plafonne sous la taille de page", async () => {
    const t = fakeTable(1200, 500);
    const { data } = await fetchAllRows(t.build, 1000);
    expect(data.map((r) => r.id)).toEqual(Array.from({ length: 1200 }, (_, i) => i));
  });

  it("table vide", async () => {
    const { data } = await fetchAllRows(fakeTable(0).build);
    expect(data).toEqual([]);
  });

  it("propage l'erreur", async () => {
    const err = { message: "boom" };
    const { data, error } = await fetchAllRows(() => ({
      range: async () => ({ data: null, error: err }),
    }));
    expect(data).toBeNull();
    expect(error).toBe(err);
  });
});
