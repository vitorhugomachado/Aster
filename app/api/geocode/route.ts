import { NextResponse } from 'next/server';
import { lookupCnefeAddress } from '../../data/cnefe';
import { findMunicipality, findMunicipalityByName } from '../../data/municipalities';
import { currentUser } from '../../lib/auth';
import { consumeUsage, databaseConfigured } from '../../lib/db';

interface GeocodePayload {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  ibgeId?: number;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  partial_match?: boolean;
  place_id?: string;
  geometry?: {
    location?: { lat?: number; lng?: number };
    location_type?: string;
  };
}

interface GoogleGeocodeResponse {
  status?: string;
  results?: GoogleGeocodeResult[];
}

interface AddressValidationComponent {
  componentName?: { text?: string; languageCode?: string };
  componentType?: string;
  confirmationLevel?: string;
  inferred?: boolean;
  spellCorrected?: boolean;
  replaced?: boolean;
  unexpected?: boolean;
}

interface AddressValidationResponse {
  result?: {
    verdict?: {
      inputGranularity?: string;
      validationGranularity?: string;
      geocodeGranularity?: string;
      addressComplete?: boolean;
      hasUnconfirmedComponents?: boolean;
      hasInferredComponents?: boolean;
      hasReplacedComponents?: boolean;
    };
    address?: {
      formattedAddress?: string;
      postalAddress?: {
        regionCode?: string;
        administrativeArea?: string;
        locality?: string;
        postalCode?: string;
        addressLines?: string[];
      };
      addressComponents?: AddressValidationComponent[];
      missingComponentTypes?: string[];
      unconfirmedComponentTypes?: string[];
      unresolvedTokens?: string[];
    };
    geocode?: {
      location?: { latitude?: number; longitude?: number };
      placeId?: string;
      placeTypes?: string[];
    };
  };
  responseId?: string;
  error?: { message?: string; status?: string };
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 2_000;
const rateWindows = new Map<string, { count: number; startedAt: number }>();

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? value.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength)
    : '';
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeStreet(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(rua|r|avenida|av|rodovia|rod|travessa|tv|estrada|est)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function exact(expected: string, actual: string) {
  if (!expected) return true;
  return Boolean(actual && normalize(expected) === normalize(actual));
}

function exactStreet(expected: string, actual: string) {
  return Boolean(expected && actual && normalizeStreet(expected) === normalizeStreet(actual));
}

function exactState(expected: string, actual: string) {
  if (exact(expected, actual)) return true;
  const stateNames: Record<string, string> = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
    DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
    MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
    PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
    RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
    SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
  };
  return exact(stateNames[expected] ?? '', actual);
}

function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function component(result: GoogleGeocodeResult, ...types: string[]) {
  for (const type of types) {
    const match = result.address_components?.find((item) => item.types.includes(type));
    if (match) return match;
  }
  return undefined;
}

function validationComponent(data: AddressValidationResponse, ...types: string[]) {
  for (const type of types) {
    const match = data.result?.address?.addressComponents?.find((item) => item.componentType === type);
    if (match) return match;
  }
  return undefined;
}

function reviewResponse(
  code: string,
  message: string,
  suggestion?: { lat: number; lng: number; source: string; formattedAddress?: string },
) {
  return NextResponse.json(
    {
      code,
      message,
      ...(suggestion ? {
        suggestedLocation: { lat: suggestion.lat, lng: suggestion.lng },
        suggestionSource: suggestion.source,
        suggestedAddress: suggestion.formattedAddress ?? '',
      } : {}),
    },
    { status: 422, headers: { 'Cache-Control': 'no-store' } },
  );
}

function allowRequest(request: Request) {
  const forwarded = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const now = Date.now();
  const current = rateWindows.get(forwarded);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    rateWindows.set(forwarded, { count: 1, startedAt: now });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_REQUESTS_PER_WINDOW;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return NextResponse.json({ message: 'Requisição muito grande.' }, { status: 413 });
  }
  if (!allowRequest(request)) {
    return NextResponse.json(
      { code: 'rate_limited', message: 'Muitas consultas. Aguarde um minuto.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
    );
  }
  if (databaseConfigured()) {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ message: 'Entre novamente para localizar endereços.' }, { status: 401 });
    if (!(await consumeUsage(user.id, 'geocode', 600))) return NextResponse.json({ code: 'rate_limited', message: 'Limite de localização atingido. Aguarde um minuto.' }, { status: 429 });
  }

  let payload: GeocodePayload;
  try {
    payload = await request.json() as GeocodePayload;
  } catch {
    return NextResponse.json({ message: 'Corpo inválido.' }, { status: 400 });
  }

  const street = clean(payload.street, 140);
  const number = clean(payload.number, 20);
  const neighborhood = clean(payload.neighborhood, 90);
  const city = clean(payload.city, 90);
  const state = clean(payload.state, 2).toUpperCase();
  const zip = clean(payload.zip, 10);
  const requestedIbgeId = Number(payload.ibgeId);

  if (!street || !number || !city || !state) {
    return NextResponse.json({ message: 'Endereço incompleto para geocodificação.' }, { status: 400 });
  }

  const municipality = Number.isInteger(requestedIbgeId)
    ? findMunicipality(state, requestedIbgeId)
    : findMunicipalityByName(state, city);
  if (!municipality || normalize(municipality.name) !== normalize(city)) {
    return NextResponse.json(
      { code: 'invalid_city', message: 'A cidade ativa não corresponde ao cadastro municipal.' },
      { status: 422, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const cnefeMatch = await lookupCnefeAddress(
    municipality.id,
    street,
    number,
    neighborhood,
    zip,
  );
  if (cnefeMatch?.precision === 'exact') {
    return NextResponse.json({
      lat: cnefeMatch.lat,
      lng: cnefeMatch.lng,
      quality: 'exata',
      locationType: 'IBGE_CNEFE',
      source: 'IBGE_CNEFE',
      partialMatch: false,
      checks: { number: true, street: true, city: true, state: true, zip: true },
      formattedAddress: `${cnefeMatch.matchedAddress}, ${municipality.name} - ${state}, Brasil`,
      matchedPoints: cnefeMatch.matchedPoints,
      correctedStreet: cnefeMatch.correctedStreet,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const addressValidationKey = process.env.GOOGLE_MAPS_ADDRESS_VALIDATION_KEY
    || process.env.GOOGLE_MAPS_GEOCODING_KEY;
  const geocodingKey = process.env.GOOGLE_MAPS_GEOCODING_KEY;
  const approximateCnefeSuggestion = cnefeMatch
    ? {
        lat: cnefeMatch.lat,
        lng: cnefeMatch.lng,
        source: 'IBGE_CNEFE_INTERPOLATED',
        formattedAddress: `${cnefeMatch.matchedAddress}, ${municipality.name} - ${state}, Brasil`,
      }
    : undefined;

  if (!addressValidationKey && !geocodingKey) {
    if (approximateCnefeSuggestion) {
      return reviewResponse(
        'insufficient_precision',
        'O IBGE encontrou apenas uma posição interpolada. Confirme o ponto no mapa.',
        approximateCnefeSuggestion,
      );
    }
    return NextResponse.json(
      { code: 'geocoder_not_configured', message: 'O endereço não está na base do IBGE e a validação do Google ainda não foi configurada.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (addressValidationKey) {
    try {
      const validationResponse = await fetch(
        `https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(addressValidationKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            address: {
              regionCode: 'BR',
              administrativeArea: state,
              locality: municipality.name,
              ...(zip ? { postalCode: zip.replace(/\D/g, '') } : {}),
              addressLines: [
                `${street}, ${number}`,
                neighborhood,
              ].filter(Boolean),
            },
          }),
        },
      );

      if (validationResponse.ok) {
        const validation = await validationResponse.json() as AddressValidationResponse;
        const verdict = validation.result?.verdict;
        const validatedAddress = validation.result?.address;
        const validatedGeocode = validation.result?.geocode;
        const lat = validatedGeocode?.location?.latitude;
        const lng = validatedGeocode?.location?.longitude;
        const returnedNumber = validationComponent(validation, 'street_number')?.componentName?.text ?? '';
        const returnedStreet = validationComponent(validation, 'route')?.componentName?.text ?? '';
        const returnedCity = validatedAddress?.postalAddress?.locality
          || validationComponent(validation, 'locality', 'postal_town', 'administrative_area_level_2')?.componentName?.text
          || '';
        const returnedState = validatedAddress?.postalAddress?.administrativeArea ?? '';
        const returnedZip = validatedAddress?.postalAddress?.postalCode
          || validationComponent(validation, 'postal_code')?.componentName?.text
          || '';
        const checks = {
          number: exact(number, returnedNumber),
          street: exactStreet(street, returnedStreet),
          city: exact(municipality.name, returnedCity),
          state: exactState(state, returnedState),
          zip: exact(zip.replace(/\D/g, ''), returnedZip.replace(/\D/g, '')),
        };
        const hasCoordinates = typeof lat === 'number' && Number.isFinite(lat)
          && typeof lng === 'number' && Number.isFinite(lng);
        const missingComponents = validatedAddress?.missingComponentTypes ?? [];
        const unconfirmedComponents = validatedAddress?.unconfirmedComponentTypes ?? [];
        const unresolvedTokens = validatedAddress?.unresolvedTokens ?? [];
        const premiseLevel = ['PREMISE', 'SUB_PREMISE'].includes(verdict?.geocodeGranularity ?? '');
        const isConfirmedPremise = verdict?.addressComplete === true
          && verdict?.hasUnconfirmedComponents !== true
          && missingComponents.length === 0
          && unconfirmedComponents.length === 0
          && unresolvedTokens.length === 0
          && premiseLevel
          && Object.values(checks).every(Boolean)
          && hasCoordinates;

        if (isConfirmedPremise && typeof lat === 'number' && typeof lng === 'number') {
          if (distanceKm({ lat: municipality.lat, lng: municipality.lng }, { lat, lng }) > 150) {
            return reviewResponse(
              'outside_active_city',
              'As coordenadas validadas estão longe da cidade ativa.',
            );
          }
          return NextResponse.json({
            lat,
            lng,
            quality: 'exata',
            locationType: `ADDRESS_VALIDATION_${verdict?.geocodeGranularity ?? 'UNKNOWN'}`,
            source: 'GOOGLE_ADDRESS_VALIDATION',
            partialMatch: false,
            checks,
            formattedAddress: validatedAddress?.formattedAddress ?? '',
            placeId: validatedGeocode?.placeId ?? '',
            validation: {
              addressComplete: verdict?.addressComplete === true,
              validationGranularity: verdict?.validationGranularity ?? '',
              geocodeGranularity: verdict?.geocodeGranularity ?? '',
              hasInferredComponents: verdict?.hasInferredComponents === true,
              hasReplacedComponents: verdict?.hasReplacedComponents === true,
            },
          }, { headers: { 'Cache-Control': 'no-store' } });
        }

        const suggestion = hasCoordinates && typeof lat === 'number' && typeof lng === 'number'
          ? {
              lat,
              lng,
              source: 'GOOGLE_ADDRESS_VALIDATION',
              formattedAddress: validatedAddress?.formattedAddress,
            }
          : approximateCnefeSuggestion;
        const cityMatches = checks.city && checks.state;
        return reviewResponse(
          cityMatches ? 'address_requires_review' : 'outside_active_city',
          cityMatches
            ? 'O Google encontrou o endereço, mas não confirmou o imóvel e o número com segurança. Revise o ponto no mapa.'
            : 'O Google não confirmou que o endereço pertence à cidade e UF selecionadas.',
          suggestion,
        );
      }

      // Chaves antigas podem ainda não ter a Address Validation API habilitada.
      // Nessa situação mantemos o Geocoding como contingência, sem interromper a importação.
      if (![400, 403, 404, 429].includes(validationResponse.status) && validationResponse.status < 500) {
        return NextResponse.json(
          { code: 'validation_failed', message: 'O Google não aceitou a validação do endereço.' },
          { status: 502, headers: { 'Cache-Control': 'no-store' } },
        );
      }
    } catch {
      // Falha temporária: o fluxo abaixo usa o Geocoding somente como contingência.
    }
  }

  if (!geocodingKey) {
    if (approximateCnefeSuggestion) {
      return reviewResponse(
        'insufficient_precision',
        'O IBGE encontrou apenas uma posição interpolada. Confirme o ponto no mapa.',
        approximateCnefeSuggestion,
      );
    }
    return NextResponse.json(
      { code: 'geocoder_not_configured', message: 'A validação exata do endereço está temporariamente indisponível.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const address = [street, number, neighborhood, zip, city, state, 'Brasil']
    .filter(Boolean)
    .join(', ');
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('components', 'country:BR');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'br');
  url.searchParams.set(
    'bounds',
    `${municipality.lat - 0.35},${municipality.lng - 0.35}|${municipality.lat + 0.35},${municipality.lng + 0.35}`,
  );
  url.searchParams.set('key', geocodingKey);

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ message: 'Google Geocoding indisponível.' }, { status: 502 });
    }

    const data = await response.json() as GoogleGeocodeResponse;
    if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
      return NextResponse.json(
        { code: 'not_found', message: 'Endereço não localizado.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (data.status === 'OVER_QUERY_LIMIT') {
      return NextResponse.json(
        { code: 'quota_exceeded', message: 'Limite temporário do Google atingido.' },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
      );
    }
    if (data.status !== 'OK') {
      return NextResponse.json({ message: 'O Google não aceitou a consulta.' }, { status: 502 });
    }

    const candidates = data.results.map((result) => {
      const returnedNumber = component(result, 'street_number')?.long_name ?? '';
      const returnedStreet = component(result, 'route')?.long_name ?? '';
      const returnedCity = component(result, 'locality', 'postal_town', 'administrative_area_level_2')?.long_name ?? '';
      const returnedState = component(result, 'administrative_area_level_1')?.short_name ?? '';
      const returnedZip = component(result, 'postal_code')?.long_name ?? '';
      const checks = {
        number: exact(number, returnedNumber),
        street: exactStreet(street, returnedStreet),
        city: exact(city, returnedCity),
        state: exact(state, returnedState),
        zip: exact(zip.replace(/\D/g, ''), returnedZip.replace(/\D/g, '')),
      };
      return { result, checks };
    });

    const candidate = candidates.find(({ result, checks }) =>
      Object.values(checks).every(Boolean)
      && result.partial_match !== true
      && result.geometry?.location_type === 'ROOFTOP',
    );
    if (!candidate) {
      const insideCity = candidates.some(({ checks }) => checks.city && checks.state);
      const addressMatchedWithoutPrecision = candidates.some(({ checks }) => Object.values(checks).every(Boolean));
      return reviewResponse(
        addressMatchedWithoutPrecision
          ? 'insufficient_precision'
          : insideCity ? 'imprecise_address' : 'outside_active_city',
        addressMatchedWithoutPrecision
          ? 'O Google encontrou o endereço, mas sem precisão de imóvel. Confirme o ponto no mapa.'
          : insideCity
            ? 'O Google não confirmou exatamente a rua e o número dentro da cidade ativa.'
            : 'O resultado não pertence à cidade e UF selecionadas.',
        approximateCnefeSuggestion,
      );
    }

    const { result, checks } = candidate;
    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ code: 'not_found', message: 'Coordenadas não retornadas.' }, { status: 404 });
    }
    if (distanceKm({ lat: municipality.lat, lng: municipality.lng }, { lat, lng }) > 150) {
      return NextResponse.json(
        { code: 'outside_active_city', message: 'As coordenadas retornadas estão longe da cidade ativa.' },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const locationType = result.geometry?.location_type ?? 'UNKNOWN';
    return NextResponse.json({
      lat,
      lng,
      quality: 'exata',
      locationType,
      source: 'GOOGLE',
      partialMatch: result.partial_match === true,
      checks,
      formattedAddress: result.formatted_address ?? '',
      placeId: result.place_id ?? '',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { message: 'Falha temporária na geocodificação.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
