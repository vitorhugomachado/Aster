export function geocodeError(status: string, detail = '') {
  if (/billing|faturamento/i.test(detail)) return { code: 'billing_disabled', message: 'O Google recusou a localização: habilite o faturamento no projeto da chave de geocodificação.', status: 503 };
  if (['OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT', 'RESOURCE_EXHAUSTED'].includes(status)) return { code: 'quota_exceeded', message: 'O limite de consultas do Google foi atingido. Verifique a cota e tente novamente mais tarde.', status: 429 };
  if (['REQUEST_DENIED', 'PERMISSION_DENIED', 'UNAUTHENTICATED'].includes(status)) return { code: 'geocoder_denied', message: 'O Google recusou a consulta. Verifique a chave, suas restrições e se a API de localização está habilitada.', status: 503 };
  if (['INVALID_REQUEST', 'INVALID_ARGUMENT'].includes(status)) return { code: 'invalid_address_request', message: 'O Google considerou a consulta inválida. Revise rua, número, cidade e UF.', status: 400 };
  if (status === 'ZERO_RESULTS') return { code: 'not_found', message: 'O Google não encontrou esse endereço. Confira a grafia e o número ou confirme o ponto no mapa.', status: 404 };
  return { code: 'geocoder_unavailable', message: 'O serviço de localização está temporariamente indisponível. Tente novamente.', status: 502 };
}
