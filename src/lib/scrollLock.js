// src/lib/scrollLock.js
// Verrou du défilement de la page pendant qu'une fenêtre (Modal) est ouverte.
// Un compteur par élément : le défilement d'origine est mémorisé à la première ouverture et rendu
// quand la dernière fenêtre se ferme, quel que soit l'ordre des fermetures.

const locks = new Map(); // élément → { count, overflow }

const defaultTarget = () => (typeof document === "undefined" ? null : document.body);

// Pose un verrou et renvoie la fonction qui le retire (sans effet au deuxième appel).
export const acquireScrollLock = (target = defaultTarget()) => {
  if (!target) return () => {};
  const state = locks.get(target) || { count: 0, overflow: target.style.overflow };
  if (state.count === 0) {
    state.overflow = target.style.overflow;
    target.style.overflow = "hidden";
  }
  state.count += 1;
  locks.set(target, state);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = locks.get(target);
    if (current !== state) return; // verrous déjà remis à zéro
    state.count -= 1;
    if (state.count <= 0) {
      target.style.overflow = state.overflow;
      locks.delete(target);
    }
  };
};

export const scrollLockCount = (target = defaultTarget()) => locks.get(target)?.count || 0;

// Retire tous les verrous d'un élément et lui rend son défilement d'origine.
export const resetScrollLock = (target = defaultTarget()) => {
  if (!target) return;
  const state = locks.get(target);
  locks.delete(target);
  target.style.overflow = state ? state.overflow : "";
};

// Attribut posé sur le fond de chaque fenêtre ouverte
export const MODAL_OVERLAY_ATTR = "data-modal-overlay";

// Changement de route : si aucune fenêtre n'est affichée, aucun verrou ne doit subsister.
export const releaseOrphanScrollLock = (doc = typeof document === "undefined" ? null : document) => {
  if (!doc?.body) return false;
  if (doc.querySelector(`[${MODAL_OVERLAY_ATTR}]`)) return false;
  const orphan = scrollLockCount(doc.body) > 0 || doc.body.style.overflow === "hidden";
  if (orphan) resetScrollLock(doc.body);
  return orphan;
};
