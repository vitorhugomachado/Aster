export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

import { geocodeError } from '../../lib/geocode-errors';
import { GeminiServiceError } from '../../lib/gemini';
import { NextResponse } from 'next/server';
import { lookupCnefeAddress } from '../../data/cnefe';
import { findMunicipality, findMunicipalityByName } from '../../data/municipalities';
import { currentUser } from '../../lib/auth';
import { consumeUsage, databaseConfigured } from '../../lib/db';
import { POST as reviewAddress } from '../address-suggestion/route';
import { decideAddress, type LocationCandidate } from '../../lib/address-decision';

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
  error_message?: string;
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

async function locateAddress(request: Request, collect = false) {
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
    const missing = [['rua', street], ['número', number], ['cidade', city], ['UF', state]]
      .filter(([, value]) => !value).map(([label]) => label);
    return NextResponse.json({ code: 'incomplete_address', message: `Endereço incompleto: informe ${missing.join(', ')}.` }, { status: 400 });
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
    if (!Number.isFinite(cnefeMatch.lat) || !Number.isFinite(cnefeMatch.lng)
      || Math.abs(cnefeMatch.lat) > 90 || Math.abs(cnefeMatch.lng) > 180
      || distanceKm(municipality, cnefeMatch) > 150) {
      return reviewResponse('outside_active_city', 'O ponto do IBGE não corresponde à região da cidade selecionada.');
    }
    if (collect) return NextResponse.json({ candidates: [{ id: 'ibge:0', lat: cnefeMatch.lat, lng: cnefeMatch.lng,
      source: 'IBGE_CNEFE', formattedAddress: cnefeMatch.matchedAddress,
      numberMatched: true, streetMatched: true, precision: 'exata',
    }], correctedStreet: cnefeMatch.correctedStreet });
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

  // A configured Geoapify key selects the free provider; never fall back to
  // paid Google requests when its quota or service is unavailable.
  const geoapifyKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (geoapifyKey) {
    // Use the official street spelling/type already matched by CNEFE,
    // including when its house-number coordinates are only interpolated.
    const cnefeStreet = cnefeMatch?.matchedAddress.slice(0, cnefeMatch.matchedAddress.lastIndexOf(',')).trim();
    const searchStreet = cnefeMatch?.correctedStreet || cnefeStreet || street;
    const url = new URL('https://api.geoapify.com/v1/geocode/search');
    for (const [key, value] of Object.entries({
      housenumber: number, street: searchStreet, city: municipality.name, state,
      country: 'Brazil', ...(zip ? { postcode: zip.replace(/\D/g, '') } : {}),
      filter: 'countrycode:br', bias: `proximity:${municipality.lng},${municipality.lat}`,
      lang: 'pt', format: 'json', limit: '5', apiKey: geoapifyKey,
    })) url.searchParams.set(key, value);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        const denied = [401, 403].includes(response.status);
        return NextResponse.json({ code: response.status === 429 ? 'rate_limited' : denied ? 'geocoder_denied' : 'geocoder_unavailable', message: response.status === 429 ? 'Limite de consultas do Geoapify atingido. Tente mais tarde.' : denied ? 'Geoapify recusou o acesso. Confira a chave e suas restrições.' : 'Serviço Geoapify temporariamente indisponível. Tente novamente mais tarde.' }, { status: response.status === 429 ? 429 : 503 });
      }
      const data = await response.json() as { results?: Array<{
        lat?: number; lon?: number; country_code?: string; city?: string;
        state?: string; state_code?: string; street?: string; housenumber?: string;
        postcode?: string; formatted?: string; result_type?: string; place_id?: string;
        rank?: { confidence?: number; confidence_building_level?: number; match_type?: string };
      }> };
      const candidates = (data.results ?? []).filter((item) =>
        item.country_code === 'br' && exact(city, item.city ?? '')
        && exactState(state, item.state_code || item.state || '')
        && typeof item.lat === 'number' && Number.isFinite(item.lat)
        && typeof item.lon === 'number' && Number.isFinite(item.lon)
        && Math.abs(item.lat) <= 90 && Math.abs(item.lon) <= 180
        && distanceKm(municipality, { lat: item.lat, lng: item.lon }) <= 150,
      ).map((item) => ({ item, checks: {
        number: exact(number, item.housenumber ?? ''), street: exactStreet(street, item.street ?? ''),
        city: true, state: true, zip: exact(zip.replace(/\D/g, ''), (item.postcode ?? '').replace(/\D/g, '')),
      } }));
      if (collect) {
        const collected: LocationCandidate[] = candidates.map(({ item, checks }, index) => ({
          id: `geoapify:${index}`, lat: item.lat!, lng: item.lon!, source: 'GEOAPIFY',
          formattedAddress: item.formatted ?? '', numberMatched: checks.number, streetMatched: checks.street,
          precision: item.result_type === 'building' && (item.rank?.confidence_building_level ?? 0) >= 0.95 ? 'exata' : 'aproximada',
          evidence: { checks, resultType: item.result_type, rank: item.rank },
        }));
        if (approximateCnefeSuggestion) collected.push({ id: 'ibge:estimated',
          ...approximateCnefeSuggestion, numberMatched: false, streetMatched: true, precision: 'aproximada' });
        return NextResponse.json({ candidates: collected,
          ...(searchStreet !== street ? { correctedStreet: searchStreet } : {}) });
      }
      const confirmed = candidates.find(({ item, checks }) => Object.values(checks).every(Boolean)
        && item.result_type === 'building' && item.rank?.match_type === 'full_match'
        && (item.rank.confidence ?? 0) >= 0.95 && (item.rank.confidence_building_level ?? 0) >= 0.95);
      if (confirmed) {
        const { item, checks } = confirmed;
        return NextResponse.json({ lat: item.lat, lng: item.lon, quality: 'exata',
          source: 'GEOAPIFY', locationType: 'GEOAPIFY_BUILDING', partialMatch: false,
          checks, formattedAddress: item.formatted ?? '', placeId: item.place_id ?? '',
          ...(searchStreet !== street ? { correctedStreet: searchStreet } : {}),
        }, { headers: { 'Cache-Control': 'no-store' } });
      }
      const streetCandidate = candidates.find(({ checks }) => checks.street);
      const suggestion = streetCandidate?.item;
      let code = 'address_not_found';
      let message = 'Endereço não localizado nas bases consultadas. Confira o nome da rua, número e CEP.';
      if ((data.results ?? []).length > 0 && candidates.length === 0) {
        code = 'outside_active_city';
        message = 'Os resultados encontrados não correspondem à cidade e UF selecionadas ou estão longe da cidade. Confira o município e o CEP.';
      } else if (candidates.length > 0 && !streetCandidate) {
        code = 'street_not_confirmed';
        message = 'A cidade foi encontrada, mas a rua informada não foi confirmada. Confira a grafia e o tipo de logradouro.';
      } else if (streetCandidate && !streetCandidate.checks.number) {
        code = 'number_not_confirmed';
        message = `Rua localizada, mas o número ${number} não foi confirmado. O ponto sugerido é aproximado; confira o imóvel no mapa.`;
      } else if (streetCandidate && !streetCandidate.checks.zip) {
        code = 'postcode_mismatch';
        message = 'Rua e número encontrados, mas o CEP retornado diverge do informado. Confira o CEP e o ponto sugerido.';
      } else if (streetCandidate) {
        code = 'insufficient_precision';
        message = streetCandidate.item.result_type !== 'building'
          ? 'Rua e número correspondentes, mas a localização retornada não tem precisão de imóvel. Confirme o ponto no mapa.'
          : 'Rua e número encontrados, mas a confiança na posição do imóvel é insuficiente para confirmação automática. Confira o ponto sugerido.';
      }
      if (!suggestion && approximateCnefeSuggestion) {
        code = 'insufficient_precision';
        message = `O IBGE identificou ${searchStreet}, mas não confirmou a posição exata do número ${number}. O ponto sugerido foi estimado entre imóveis vizinhos. Ajuste e confirme no mapa.`;
      }
      return reviewResponse(code, message,
        suggestion ? { lat: suggestion.lat!, lng: suggestion.lon!, source: 'GEOAPIFY', formattedAddress: suggestion.formatted } : approximateCnefeSuggestion);
    } catch {
      return NextResponse.json({ code: 'geocoder_unavailable', message: 'Falha temporária no Geoapify. Tente novamente.' }, { status: 502 });
    }
  }

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

  const failureResponse = (failure: ReturnType<typeof geocodeError>) => NextResponse.json({
    code: failure.code,
    message: failure.message + (approximateCnefeSuggestion ? ' O IBGE oferece apenas uma posição estimada; confirme o ponto no mapa.' : ''),
    ...(approximateCnefeSuggestion ? {
      suggestedLocation: { lat: approximateCnefeSuggestion.lat, lng: approximateCnefeSuggestion.lng },
      suggestionSource: approximateCnefeSuggestion.source,
      suggestedAddress: approximateCnefeSuggestion.formattedAddress,
    } : {}),
  }, { status: failure.status, headers: { 'Cache-Control': 'no-store', ...(failure.status === 429 ? { 'Retry-After': '60' } : {}) } });
  let validationFailure: ReturnType<typeof geocodeError> | undefined;
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

      const validationError = await validationResponse.json().catch(() => ({})) as AddressValidationResponse;
      validationFailure = geocodeError(validationError.error?.status ?? 'UNKNOWN_ERROR', validationError.error?.message);
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
    if (validationFailure) return failureResponse(validationFailure);
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
    const data = await response.json().catch(() => ({})) as GoogleGeocodeResponse;
    if (!response.ok || data.status !== 'OK') {
      return failureResponse(geocodeError(data.status ?? 'UNKNOWN_ERROR', data.error_message));
    }
    if (!data.results?.length) {
      return failureResponse(geocodeError('UNKNOWN_ERROR'));
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

// Bases confirm first; Groq only investigates unresolved addresses.
export async function POST(request: Request) {
  if (!process.env.GROQ_API_KEY?.trim()) return locateAddress(request);
  const replay = request.clone();
  const validation = await locateAddress(request.clone() as Request);
  if (validation.ok || [401, 413, 429].includes(validation.status)) return validation;
  const first = await locateAddress(request, true);
  const data = await first.json() as Record<string, unknown>;
  if (!first.ok && ['invalid_city', 'incomplete_address'].includes(String(data.code))) return NextResponse.json(data, { status: first.status });
  if ([401, 413, 429].includes(first.status)) return NextResponse.json(data, { status: first.status });
  const payload = await replay.json() as GeocodePayload;
  const candidates = (Array.isArray(data.candidates) ? data.candidates : []) as LocationCandidate[];
  if (typeof data.lat === 'number' && typeof data.lng === 'number') candidates.push({
    id: 'base:0', lat: data.lat, lng: data.lng, source: String(data.source),
    formattedAddress: String(data.formattedAddress ?? ''), numberMatched: true, streetMatched: true,
    precision: data.quality === 'exata' ? 'exata' : 'aproximada',
  });
  let correctedAddress: GeocodePayload | undefined = typeof data.correctedStreet === 'string'
    ? { ...payload, street: data.correctedStreet } : undefined;
  const headers = new Headers(replay.headers);
  headers.delete('content-length');
  const internalRequest = (body: unknown) => new Request(replay.url, { method: 'POST', headers, body: JSON.stringify(body) });
  const answer = (body: unknown, status = 422) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const metadata = () => ({ reviewedByAi: true, confirmationSource: 'groq', ...(correctedAddress ? { correctedAddress } : {}) });
  const suggestion = (candidate?: LocationCandidate) => candidate ? {
    suggestedLocation: { lat: candidate.lat, lng: candidate.lng }, suggestionSource: candidate.source,
    suggestedAddress: candidate.formattedAddress,
  } : {};
  try {
    if (!candidates.some((item) => item.numberMatched && item.streetMatched) && first.ok) {
      const review = await reviewAddress(internalRequest({ ...payload,
        locationEvidence: { code: data.code, message: data.message, suggestedAddress: candidates[0]?.formattedAddress } }));
      if (!review.ok) {
        const failure = await review.json() as { message?: string };
        throw new GeminiServiceError(failure.message || 'Revisão de nomenclatura indisponível.', review.status);
      }
      const correction = await review.json() as { changed?: boolean; address?: GeocodePayload };
      if (correction.changed && correction.address) {
        correctedAddress = { ...payload, street: correction.address.street, neighborhood: correction.address.neighborhood };
        const retry = await locateAddress(internalRequest(correctedAddress), true);
        const retryData = await retry.json() as { candidates?: LocationCandidate[] };
        if (retry.ok && Array.isArray(retryData.candidates)) {
          candidates.push(...retryData.candidates.map((item) => ({ ...item, id: `retry:${item.id}` })));
        }
      }
    }
    const decision = await decideAddress({ original: payload, corrected: correctedAddress }, candidates);
    const selected = decision.candidate;
    if (decision.decision === 'confirmar' && selected) return answer({
      ...metadata(), decision: 'confirmar', selectedCandidateId: selected.id, aiReviewNote: decision.reason,
      lat: selected.lat, lng: selected.lng, quality: selected.precision, source: selected.source,
      locationType: 'AI_SELECTED', formattedAddress: selected.formattedAddress,
    }, 200);
    const numberFound = candidates.some((item) => item.numberMatched && item.streetMatched);
    return answer({ ...metadata(), decision: decision.decision, selectedCandidateId: selected?.id,
      code: !numberFound && candidates.some((item) => item.streetMatched) ? 'number_not_found' : decision.decision === 'nao_localizado' ? 'address_not_found' : 'address_requires_review',
      message: !numberFound && candidates.some((item) => item.streetMatched) ? `Numeração não localizada: ${payload.number}. ${decision.reason}` : decision.reason,
      aiReviewNote: decision.reason, ...suggestion(selected || candidates.find((item) => item.streetMatched)),
    });
  } catch (error) {
    const detail = error instanceof GeminiServiceError ? error.message
      : error instanceof SyntaxError ? 'A IA retornou uma resposta que não pôde ser interpretada.'
      : error instanceof Error && ['Decisão inválida', 'Candidato inexistente', 'Confirmação inválida'].includes(error.message)
        ? `${error.message}: a resposta da IA não corresponde às evidências disponíveis.`
        : 'A consulta à IA falhou antes de concluir a análise. Tente novamente.';
    const evidence = !candidates.length ? 'As bases não retornaram um candidato válido para este endereço.'
      : !candidates.some(item => item.streetMatched) ? 'A rua retornada pelas bases não corresponde à rua informada.'
      : !candidates.some(item => item.numberMatched && item.streetMatched) ? `Numeração não localizada: ${payload.number}. Há apenas uma posição aproximada da rua.`
      : 'Existe um candidato para a rua e o número, mas a confirmação pela IA não foi concluída.';
    const fallback = candidates.find((item) => item.streetMatched);
    return answer({ ...metadata(), confirmationSource: null, decision: 'revisar',
      code: fallback && !candidates.some((item) => item.numberMatched && item.streetMatched) ? 'number_not_found' : 'ai_review_unavailable',
      message: `${evidence} ${detail}`,
      aiReviewNote: `${evidence} ${detail}`, ...suggestion(fallback) });
  }
}


