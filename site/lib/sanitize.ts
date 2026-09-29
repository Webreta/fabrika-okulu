import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Eğitmenin yazdığı HTML (kurs açıklaması, ders açıklaması) için izinli etiket listesi.
 * Betik, olay öznitelikleri (onerror, onclick…), iframe, style ve javascript: adresleri ayıklanır.
 * Hem kaydederken hem gösterirken uygulanır (eski kayıtlar için ikinci emniyet).
 * Yöneticinin yazdığı içerikler (Hakkımızda, yasal sayfalar, SEO özel kod) güvenilir kabul edilir ve temizlenmez.
 */
export function cleanHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "s", "h2", "h3", "h4", "ul", "ol", "li", "a", "blockquote", "hr", "span", "div", "img", "table", "thead", "tbody", "tr", "th", "td", "sub", "sup", "code", "pre"],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "width", "height", "title"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    // Dış bağlantılar yeni sekmede ve güvenli rel ile açılır
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: /^https?:/i.test(attribs.href ?? "") ? { ...attribs, target: "_blank", rel: "noopener noreferrer" } : attribs }),
    },
  });
}
