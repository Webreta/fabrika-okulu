"use client";

import { useId } from "react";

/**
 * Etiket–alan bağı için bileşene özgü kimlik üretir (erişilebilirlik):
 *   const fid = useFieldId();
 *   <label htmlFor={fid("ad")}>Ad</label><input id={fid("ad")} … />
 * Aynı bileşen sayfada birden çok kez kullanılsa da kimlikler çakışmaz; döngü içinde anahtara sıra numarası eklenir.
 */
export function useFieldId() {
  const base = useId();
  return (key: string | number) => `${base}-${key}`;
}
