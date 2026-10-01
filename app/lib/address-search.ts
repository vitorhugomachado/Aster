export function addressSearchVariants(base: URL, street: string, number: string, city: string, state: string) {
  const variants: URL[] = [];
  if (base.searchParams.has('postcode')) {
    const withoutZip = new URL(base);
    withoutZip.searchParams.delete('postcode');
    variants.push(withoutZip);
  }
  const freeText = new URL(base);
  for (const key of ['street', 'housenumber', 'city', 'state', 'country', 'postcode']) freeText.searchParams.delete(key);
  const normalized = street.normalize('NFC').replace(/\s+/g, ' ').trim()
    .replace(/^r\.?\s+/i, 'Rua ').replace(/^av\.?\s+/i, 'Avenida ').replace(/^tv\.?\s+/i, 'Travessa ');
  freeText.searchParams.set('text', `${normalized}, ${number}, ${city}, ${state}, Brasil`);
  variants.push(freeText);
  return variants;
}
