// src/components/AddressAutocomplete.jsx
// Champ adresse avec suggestions Géoplateforme IGN. La saisie libre reste toujours possible :
// une erreur réseau ou une adresse introuvable ne bloque rien.
import React, { useEffect, useRef, useState } from "react";
import { controlClasses, cx, focusRing } from "./ui";
import { useField } from "./ui/field";
import { ADDRESS_MIN_CHARS, buildAddressSearchUrl, mapAddressResponse } from "../lib/address";

const DEBOUNCE_MS = 300;

/**
 * proposal = { text, n } : adresse reçue de la saisie rapide. La première suggestion IGN est
 * proposée sous le champ ; elle ne remplace la saisie que si l'utilisateur la choisit.
 * (n change à chaque remplissage, pour relancer la recherche même avec le même texte.)
 */
export default function AddressAutocomplete({ value, onChange, onSelect, placeholder, style, className, required, name, proposal }) {
  const field = useField(); // dans un <Field> : le libellé désigne ce champ
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dirty, setDirty] = useState(false); // ne cherche qu'après une frappe de l'utilisateur
  const [proposed, setProposed] = useState(null); // suggestion à confirmer
  const abortRef = useRef(null);

  useEffect(() => {
    const q = String(proposal?.text || "").trim();
    setProposed(null);
    if (q.length < ADDRESS_MIN_CHARS) return undefined;
    const controller = new AbortController();
    fetch(buildAddressSearchUrl(q, 1), { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => setProposed(mapAddressResponse(json)[0] || null))
      .catch((err) => {
        if (err?.name !== "AbortError") console.warn("Suggestion d’adresse indisponible :", err?.message);
      });
    return () => controller.abort();
  }, [proposal]);

  useEffect(() => {
    const q = String(value || "").trim();
    if (!dirty || q.length < ADDRESS_MIN_CHARS) {
      setSuggestions([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(buildAddressSearchUrl(q), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = mapAddressResponse(await res.json());
        setSuggestions(list);
        setActive(-1);
        setOpen(list.length > 0);
      } catch (err) {
        if (err?.name !== "AbortError") {
          console.warn("Autocomplétion adresse indisponible :", err?.message);
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, dirty]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = (s) => {
    setOpen(false);
    setSuggestions([]);
    setDirty(false);
    setProposed(null);
    onSelect(s);
  };

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (active >= 0) {
        e.preventDefault(); // ne soumet pas le formulaire
        choose(suggestions[active]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    // Pleine largeur : l'adresse complète reste lisible (champ et suggestions)
    <div className="relative w-full">
      <input
        type="text"
        id={field?.id}
        name={name}
        aria-describedby={field?.describedBy}
        enterKeyHint="next"
        autoComplete="off"
        value={value || ""}
        placeholder={placeholder}
        required={required}
        className={cx(controlClasses(false), className)}
        style={style}
        title={value || undefined}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          setDirty(true);
          setProposed(null);
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && suggestions.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-[60] mt-1 rounded-control border border-line bg-surface p-1.5 text-base font-normal shadow-lg">
          {suggestions.map((s, i) => (
            <li
              key={`${s.label}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown : passe avant le blur de l'input
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cx(
                "cursor-pointer rounded-lg px-3 py-2.5 leading-snug break-words",
                i === active ? "bg-accent-soft text-accent" : "text-ink"
              )}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {proposed && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-warning/30 bg-warning-soft/60 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 text-ink-soft">
            Adresse trouvée : <strong className="break-words text-ink">{proposed.label}</strong>
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => choose(proposed)}
              className={cx("min-h-11 rounded-control bg-primary px-3 font-semibold text-white hover:bg-primary-hover sm:min-h-9", focusRing)}
            >
              Utiliser
            </button>
            <button
              type="button"
              onClick={() => setProposed(null)}
              className={cx("min-h-11 rounded-control px-3 font-semibold text-ink-muted hover:bg-canvas hover:text-ink sm:min-h-9", focusRing)}
            >
              Ignorer
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
