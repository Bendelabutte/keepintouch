// Concatène des classes en ignorant les valeurs vides.
export const cx = (...parts) => parts.filter(Boolean).join(" ");

// Anneau de focus commun à tous les contrôles (Bien EDL).
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Boutons : plein (principal), blanc à contour (secondaire), texte (fantôme), danger.
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold transition " +
  focusRing +
  " disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-canvas",
  ghost: "text-accent hover:bg-accent-soft",
  quiet: "text-ink-muted hover:bg-canvas hover:text-ink",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft",
};

const BUTTON_SIZES = {
  md: "min-h-11 px-5 text-base",
  sm: "min-h-11 px-4 text-sm",
  xs: "min-h-9 px-3 text-sm",
  icon: "size-11",
};

export const buttonClasses = ({ variant = "primary", size = "md", block = false, className = "" } = {}) =>
  cx(BUTTON_BASE, BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary, BUTTON_SIZES[size] || BUTTON_SIZES.md, block && "w-full", className);

// Champs : hauts et aérés (Bien EDL).
export const controlClasses = (invalid = false) =>
  cx(
    "block min-h-11 w-full rounded-control border bg-surface px-4 py-2.5 text-base text-ink",
    "placeholder:text-ink-muted/70 outline-none transition",
    "focus:border-primary focus:ring-2 focus:ring-primary/20",
    "disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70",
    invalid ? "border-danger" : "border-line-strong"
  );
