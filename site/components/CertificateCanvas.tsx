import type { CertFields, CertField } from "@/db/schema";
import { fontFaceCss, trUpper } from "@/lib/certificates";

/**
 * Sertifikayı şablon görselinin üzerine yüzde konumlu metinlerle çizer.
 * Hem herkese açık doğrulama sayfasında hem admin önizlemesinde kullanılır.
 * Boyut: width'e göre ölçeklenir (font px değerleri şablon genişliği 1600 varsayımıyla ölçeklenir).
 */
export function CertificateCanvas({
  imageUrl, imageWidth, imageHeight, fields, name, course, date, qrDataUrl, id,
}: {
  imageUrl: string; imageWidth: number; imageHeight: number; fields: CertFields;
  name: string; course: string; date: string; qrDataUrl?: string | null; id?: string;
}) {
  const ratio = imageHeight / imageWidth;
  const scale = 100 / imageWidth; // 1 px → cqw yüzdesi
  const text = (f: CertField, value: string) => {
    const style: React.CSSProperties = {
      position: "absolute",
      left: `${f.x}%`,
      top: `${f.y}%`,
      transform: `translate(${f.align === "center" ? "-50%" : f.align === "right" ? "-100%" : "0"}, -50%)`,
      fontSize: `${f.size * scale}cqw`,
      color: f.color,
      fontWeight: Number(f.weight),
      fontFamily: `"cert-${f.font}", serif`,
      letterSpacing: `${f.spacing * scale}cqw`,
      whiteSpace: "nowrap",
      lineHeight: 1,
      textAlign: f.align,
    };
    return <div style={style}>{f.caps ? trUpper(value) : value}</div>;
  };
  return (
    <div id={id} style={{ position: "relative", width: "100%", aspectRatio: `${imageWidth}/${imageHeight}`, containerType: "inline-size", overflow: "hidden", background: "#fff" }}>
      <style dangerouslySetInnerHTML={{ __html: fontFaceCss() }} />
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }} draggable={false} />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#f3f5f9,#e3e8ef)" }} />
      )}
      {text(fields.name, name)}
      {text(fields.course, course)}
      {fields.date?.enabled && text(fields.date, date)}
      {fields.qr.enabled && qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="QR" style={{ position: "absolute", left: `${fields.qr.x}%`, top: `${fields.qr.y}%`, width: `${fields.qr.size * scale}cqw`, transform: "translate(-50%,-50%)" }} />
      )}
      <span style={{ display: "none" }}>{ratio}</span>
    </div>
  );
}
