import { describe, it, expect } from "vitest";
import { clientPath, createPathFor, parseRoute, transactionPath } from "../routes";

describe("adresses de l'application", () => {
  it("pages principales", () => {
    expect(parseRoute("/clients")).toEqual({ page: "clients", view: "list" });
    expect(parseRoute("/transactions")).toEqual({ page: "transactions", transactionId: null });
    expect(parseRoute("/remuneration")).toEqual({ page: "remuneration" });
    expect(parseRoute("/tableau-de-bord")).toEqual({ page: "dashboard" });
  });

  it("fiche, création par type et transaction", () => {
    expect(parseRoute("/clients/abc")).toEqual({ page: "clients", view: "fiche", clientId: "abc" });
    expect(parseRoute("/clients/nouveau/vendeur")).toEqual({ page: "clients", view: "create", createCategory: "seller" });
    expect(parseRoute("/clients/nouveau/acquereur").createCategory).toBe("buyer");
    expect(parseRoute("/clients/nouveau/apres-vente").createCategory).toBe("after");
    expect(parseRoute("/transactions/t1").transactionId).toBe("t1");
  });

  it("adresse inconnue → page nulle (redirection vers /clients)", () => {
    expect(parseRoute("/").page).toBeNull();
    expect(parseRoute("/clients/nouveau/inconnu").page).toBeNull();
    expect(parseRoute("/nimporte").page).toBeNull();
  });

  it("construction des liens", () => {
    expect(createPathFor("buyer")).toBe("/clients/nouveau/acquereur");
    expect(clientPath("x")).toBe("/clients/x");
    expect(transactionPath("t")).toBe("/transactions/t");
    expect(transactionPath(null)).toBe("/transactions");
  });
});
