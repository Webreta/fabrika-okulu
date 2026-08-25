"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary mt-4">Yazdır / PDF olarak kaydet</button>
  );
}
