// src/lib/fetchAll.js
// Lit toutes les lignes d'une requête Supabase page par page (PostgREST plafonne à max_rows, 1000 par défaut).
// buildQuery doit renvoyer une NOUVELLE requête triée de façon stable à chaque appel.

export const PAGE_SIZE = 1000;

export async function fetchAllRows(buildQuery, pageSize = PAGE_SIZE) {
  const rows = [];
  let from = 0;

  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };

    const page = data || [];
    rows.push(...page);

    // On ne s'arrête que sur une page vide et on avance du nombre réel de lignes reçues :
    // reste correct même si le max_rows du serveur est inférieur à pageSize.
    if (page.length === 0) break;
    from += page.length;
  }

  return { data: rows, error: null };
}
