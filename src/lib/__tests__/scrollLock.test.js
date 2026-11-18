import { describe, it, expect } from "vitest";
import { acquireScrollLock, releaseOrphanScrollLock, resetScrollLock, scrollLockCount } from "../scrollLock";

// Faux <body> : seul style.overflow est utilisé par le verrou
const fakeBody = (overflow = "") => ({ style: { overflow } });
const fakeDoc = (body, openModals = 0) => ({ body, querySelector: () => (openModals > 0 ? {} : null) });

describe("verrou du défilement (fenêtres)", () => {
  it("une fenêtre : défilement bloqué à l'ouverture, rendu à la fermeture", () => {
    const body = fakeBody();
    const release = acquireScrollLock(body);
    expect(body.style.overflow).toBe("hidden");
    release();
    expect(body.style.overflow).toBe("");
    expect(scrollLockCount(body)).toBe(0);
  });

  it("deux fenêtres, la première fermée avant la seconde : le défilement revient à la fin", () => {
    const body = fakeBody();
    const releaseDetail = acquireScrollLock(body); // ex. fiche d'une transaction
    const releaseForm = acquireScrollLock(body); // ex. « Modifier » ouvert par-dessus
    expect(scrollLockCount(body)).toBe(2);
    releaseDetail();
    expect(body.style.overflow).toBe("hidden"); // une fenêtre reste ouverte
    releaseForm();
    expect(body.style.overflow).toBe("");
  });

  it("deux fenêtres fermées dans l'ordre inverse, puis démontage répété : body retrouve son défilement", () => {
    const body = fakeBody();
    const releaseA = acquireScrollLock(body);
    const releaseB = acquireScrollLock(body);
    releaseB();
    expect(body.style.overflow).toBe("hidden");
    releaseA();
    expect(body.style.overflow).toBe("");
    // Démontage : un nettoyage appelé une seconde fois ne retire pas le verrou d'une autre fenêtre
    const releaseC = acquireScrollLock(body);
    releaseA();
    releaseB();
    expect(body.style.overflow).toBe("hidden");
    releaseC();
    expect(body.style.overflow).toBe("");
    expect(scrollLockCount(body)).toBe(0);
  });

  it("le défilement d'origine de body est conservé", () => {
    const body = fakeBody("scroll");
    const a = acquireScrollLock(body);
    const b = acquireScrollLock(body);
    a();
    b();
    expect(body.style.overflow).toBe("scroll");
  });

  it("changement de route sans fenêtre affichée : aucun verrou ne subsiste", () => {
    const body = fakeBody();
    const release = acquireScrollLock(body);
    acquireScrollLock(body);
    expect(releaseOrphanScrollLock(fakeDoc(body, 0))).toBe(true);
    expect(body.style.overflow).toBe("");
    expect(scrollLockCount(body)).toBe(0);
    release(); // nettoyage tardif d'une fenêtre : sans effet
    expect(body.style.overflow).toBe("");
    // overflow resté à « hidden » sans verrou connu : retiré aussi
    const stuck = fakeBody("hidden");
    expect(releaseOrphanScrollLock(fakeDoc(stuck, 0))).toBe(true);
    expect(stuck.style.overflow).toBe("");
  });

  it("changement de route avec une fenêtre affichée : son verrou est conservé", () => {
    const body = fakeBody();
    const release = acquireScrollLock(body);
    expect(releaseOrphanScrollLock(fakeDoc(body, 1))).toBe(false);
    expect(body.style.overflow).toBe("hidden");
    release();
    expect(body.style.overflow).toBe("");
  });

  it("resetScrollLock retire tout", () => {
    const body = fakeBody();
    acquireScrollLock(body);
    acquireScrollLock(body);
    resetScrollLock(body);
    expect(body.style.overflow).toBe("");
    expect(scrollLockCount(body)).toBe(0);
  });
});
