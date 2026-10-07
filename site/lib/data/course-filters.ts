import { ne } from "drizzle-orm";
import { courses } from "@/db/schema";

/**
 * Arşivdeki (silinen) eğitimleri dışarıda bırakan koşul. Site tarafı zaten yalnızca "published" eğitimleri gösterir;
 * tüm eğitimleri listeleyen yönetici/eğitmen sorgularına (kurs listesi, seçim kutuları, sayaçlar) bu koşul eklenir.
 * Arşiv yalnızca /admin/kurslar/arsiv sayfasında görünür.
 */
export const notArchived = ne(courses.status, "archived");
