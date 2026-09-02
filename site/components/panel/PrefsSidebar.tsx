"use client";

import { usePathname } from "next/navigation";
import { SideNav } from "@/components/panel/SideNav";

const ITEMS = [
  { href: "/panel/hesap", label: "Hesap Bilgileri", icon: "user" },
  { href: "/panel/gorunum", label: "Çalışma Odam", icon: "paint" },
  { href: "/panel/bildirim-ayar", label: "Bildirimler", icon: "bell" },
  { href: "/panel/ozgecmis", label: "Özgeçmişim", icon: "doc" },
  { href: "/panel/belge", label: "Belge Yükle", icon: "upload" },
  { href: "/panel/adres", label: "Adreslerim", icon: "mapPin" },
  { href: "/panel/siparis", label: "Satınalma Geçmişim", icon: "cart" },
] as const;

/** Tercihler bölümünün sol menüsü */
export function PrefsSidebar() {
  const pathname = usePathname();
  return <SideNav label="Tercihler" items={ITEMS.map((it) => ({ ...it, active: pathname === it.href || pathname.startsWith(it.href + "/") }))} />;
}
