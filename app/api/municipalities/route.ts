import { NextResponse } from 'next/server';

const BRAZILIAN_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]);

interface IbgeMunicipality {
  id?: number;
  nome?: string;
}

export async function GET(request: Request) {
  const state = new URL(request.url).searchParams.get('state')?.trim().toUpperCase() ?? '';
  if (!BRAZILIAN_STATES.has(state)) {
    return NextResponse.json({ message: 'UF inválida.' }, { status: 400 });
  }

  const url = new URL(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios`);
  url.searchParams.set('orderBy', 'nome');

  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) {
      return NextResponse.json({ message: 'Serviço de municípios indisponível.' }, { status: 502 });
    }
    const data = await response.json() as IbgeMunicipality[];
    const municipalities = data
      .filter((item) => typeof item.id === 'number' && typeof item.nome === 'string')
      .map((item) => ({ id: item.id!, name: item.nome! }));

    return NextResponse.json(
      { state, municipalities },
      { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
    );
  } catch {
    return NextResponse.json({ message: 'Falha temporária ao consultar municípios.' }, { status: 502 });
  }
}
