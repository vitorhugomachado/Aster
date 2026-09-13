import { NextResponse } from 'next/server';
import { listMunicipalities } from '../../data/municipalities';

const BRAZILIAN_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]);

export async function GET(request: Request) {
  const state = new URL(request.url).searchParams.get('state')?.trim().toUpperCase() ?? '';
  if (!BRAZILIAN_STATES.has(state)) {
    return NextResponse.json({ message: 'UF inválida.' }, { status: 400 });
  }

  const municipalities = listMunicipalities(state)
    .map((item) => ({ id: item.id, name: item.name }));

  return NextResponse.json(
    { state, municipalities, source: 'local_ibge_snapshot' },
    { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
  );
}
