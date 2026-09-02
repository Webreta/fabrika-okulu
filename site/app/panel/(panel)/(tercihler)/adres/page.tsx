import { getCurrentUser } from "@/lib/auth/session";
import { isAddressFilled, normalizeAddress } from "@/lib/address";
import { AddressesForm } from "@/components/panel/AddressForm";

/** Tercihler → Adreslerim: fatura + gönderim adresi; sipariş verirken ön tanımlı gelir */
export default async function AddressesPage() {
  const u = (await getCurrentUser())!;
  const billing = normalizeAddress({ name: u.name, phone: "", ...u.addresses.billing });
  const shipping = normalizeAddress(u.addresses.shipping);
  const same = !isAddressFilled(u.addresses.shipping) || JSON.stringify(shipping) === JSON.stringify(normalizeAddress(u.addresses.billing));
  return (
    <>
      <h2 className="mb-4 text-xl font-bold text-navy-800">Adreslerim</h2>
      <AddressesForm billing={billing} shipping={shipping} shippingSame={same} />
    </>
  );
}
