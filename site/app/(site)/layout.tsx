import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { getCurrentUser } from "@/lib/auth/session";
import { getCart } from "@/lib/cart";
import { getSetting } from "@/lib/settings";
import { listCategories } from "@/lib/data/categories";
import { publicRoutes } from "@/lib/data/routes";

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, cart, general, seo, categories] = await Promise.all([
    getCurrentUser(),
    getCart(),
    getSetting("general"),
    getSetting("seo"),
    listCategories(),
  ]);
  const routes = await publicRoutes();
  const cats = categories.map((k) => ({ name: k.name, slug: k.slug }));
  const rts = routes.map((r) => ({ name: r.name, slug: r.slug }));
  return (
    <>
      <Header user={user ? { name: user.name, role: user.role } : null} cartCount={cart.length} categories={cats} routes={rts} />
      <main className="min-h-[60vh]">{children}</main>
      <Footer text={general.footerText} categories={cats} />
      {seo.headCode && <div dangerouslySetInnerHTML={{ __html: seo.headCode }} />}
    </>
  );
}
