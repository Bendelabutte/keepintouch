// Concatène des classes en ignorant les valeurs vides.
export const cx = (...parts) => parts.filter(Boolean).join(" ");

// Anneau de focus commun à tous les contrôles.
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Boutons : variante, taille, pleine largeur.
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold " +
  "transition-colors duration-150 select-none " +
  focusRing +
  " disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS = {
  primary: "bg-primary text-white shadow-card hover:bg-primary-hover",
  accent: "bg-accent text-white shadow-card hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-subtle",
  ghost: "text-primary hover:bg-primary-soft",
  quiet: "text-ink-muted hover:bg-subtle hover:text-ink",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft",
};

const BUTTON_SIZES = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-11 px-5 text-base",
  icon: "size-10",
};

export const buttonClasses = ({ variant = "primary", size = "md", block = false, className = "" } = {}) =>
  cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], block && "w-full", className);

// Champs de saisie : bordure, focus, désactivé, erreur.
export const controlClasses = (invalid = false) =>
  cx(
    "block min-h-10 w-full rounded-control border bg-surface px-3 py-2 text-sm text-ink",
    "placeholder:text-ink-muted/70 outline-none transition-colors duration-150",
    "focus:border-primary focus:ring-2 focus:ring-primary/20",
    "disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-muted",
    invalid ? "border-danger focus:border-danger focus:ring-danger/20" : "border-line-strong"
  );
