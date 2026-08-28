// Kurs önerileri sabitleri ve tipi (server action dosyasından ayrı — "use server" yalnızca
// async fonksiyon export edebildiği için sabitler burada tutulur).

export const SUGGESTION_MAX_LEN = 1000;
export const SUGGESTION_MAX_COUNT = 5;

export type SuggestionItem = { id: number; text: string; createdAt: string };
