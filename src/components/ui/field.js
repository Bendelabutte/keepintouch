// Contexte reliant un <Field> (libellé, aide, erreur) au contrôle qu'il contient.
import { createContext, useContext } from "react";

export const FieldContext = createContext(null);
export const useField = () => useContext(FieldContext);

// Props communes des contrôles (Input, Textarea, Select) placés dans un <Field>.
export const useControlProps = ({ id, invalid, required, ...rest }) => {
  const field = useField();
  const isInvalid = invalid ?? field?.invalid ?? false;
  return {
    id: id ?? field?.id,
    required: required ?? field?.required,
    "aria-invalid": isInvalid || undefined,
    "aria-describedby": field?.describedBy,
    isInvalid,
    rest,
  };
};
