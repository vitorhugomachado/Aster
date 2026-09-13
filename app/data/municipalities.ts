import municipalityData from './municipalities.json';

export interface MunicipalityRecord {
  id: number;
  name: string;
  lat: number;
  lng: number;
  stateCode: number;
}

const STATE_CODES: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17,
  MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35,
  PR: 41, SC: 42, RS: 43,
  MS: 50, MT: 51, GO: 52, DF: 53,
};

const municipalities = municipalityData as MunicipalityRecord[];

export function listMunicipalities(state: string) {
  const stateCode = STATE_CODES[state];
  if (!stateCode) return [];
  return municipalities
    .filter((item) => item.stateCode === stateCode)
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

export function findMunicipality(state: string, id: number) {
  const stateCode = STATE_CODES[state];
  return municipalities.find((item) => item.stateCode === stateCode && item.id === id);
}

export function findMunicipalityByName(state: string, name: string) {
  const stateCode = STATE_CODES[state];
  const normalizedName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return municipalities.find((item) => item.stateCode === stateCode && item.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') === normalizedName);
}
