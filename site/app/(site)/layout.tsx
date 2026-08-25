import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { getCurrentUser } from "@/lib/auth/session";
import { getCart } from "@/lib/cart";
import { getSetting } from "@/lib/settings";

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, cart, general, seo] = await Promise.all([
    getCurrentUser(),
    getCart(),
    getSetting("general"),
    getSetting("seo"),
  ]);
  return (
    <>
      <Header user={user ? { name: user.name, role: user.role } : null} cartCount={cart.length} />
      <main className="min-h-[60vh]">{children}</main>
      <Footer text={general.footerText} />
      {seo.headCode && <div dangerouslySetInnerHTML={{ __html: seo.headCode }} />}
    </>
  );
}
