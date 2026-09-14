# aster

CRM geográfico para mapear clientes de fibra, organizar oportunidades e planejar visitas comerciais dentro dos municípios do Paraná.

## Interface

A interface usa componentes de código aberto do [Watermelon UI](https://ui.watermelon.sh/), instalados pelo registro shadcn e adaptados aos fluxos de mapa, clientes, importações, grupos rurais e Aster IA. Os componentes ficam no próprio repositório para permitir evolução visual sem dependência de um pacote fechado.

## Funcionalidades

- Seletor com os 399 municípios do Paraná e limites oficiais do IBGE.
- Importação de `.xlsx` e `.csv` com `nome`, `logradouro` e `número` obrigatórios.
- Geocodificação automática: CNEFE/IBGE primeiro e Google Geocoding como complemento.
- Revisão ortográfica automática com Gemini quando o endereço não é confirmado; as coordenadas continuam sendo validadas pelo CNEFE/Google.
- Aster IA para consultar clientes, planos, grupos rurais e importações da cidade ativa em linguagem natural.
- Funil de oportunidades com etapas, pesquisa, filtros, importação e cadastro diretamente no mapa.
- Priorização comercial explicável por retorno, etapa, proximidade de clientes, telefone, plano e qualidade da localização.
- Planejamento de rotas com 2 a 10 paradas, otimização pela Google Routes API e abertura do roteiro no Google Maps.
- Validação estrita de cidade, UF, rua e número para evitar marcadores no município errado.
- Diferenciação entre localização exata, aproximada e pendente.
- Zoom no mapa por rolagem, pinça, botões ou `Ctrl +` / `Ctrl -`, com arraste livre.
- Card completo ao selecionar um cliente, com edição de todos os dados operacionais.
- Cadastro manual e nova tentativa de localização para registros pendentes.
- Importação de telefone, e-mail, documento e contrato sem enviar esses dados ao geocodificador.
- Conta protegida por e-mail e senha, sessões seguras e bloqueio de tentativas repetidas.
- PostgreSQL como fonte de dados na produção, com migração automática da base que já estiver salva no navegador.
- Exportação de backup completo em JSON e exportação de oportunidades em CSV pela API.
- Auditoria de alterações e limites duráveis para chamadas de geocodificação, IA e rotas.
- Design system documentado em `/design-system`.

## Configuração

Use Node.js 22.13 ou superior e configure as variáveis:

```env
GOOGLE_MAPS_BROWSER_KEY=
GOOGLE_MAPS_GEOCODING_KEY=
GOOGLE_MAPS_ADDRESS_VALIDATION_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
DATABASE_URL=
ASTER_BOOTSTRAP_TOKEN=
GOOGLE_MAPS_ROUTES_KEY=
```

A chave de navegador deve ser restrita ao Maps JavaScript API e aos domínios autorizados. A chave de servidor deve ser restrita ao Geocoding API e nunca é enviada ao navegador.

Na primeira execução com banco configurado, a tela de acesso solicita o `ASTER_BOOTSTRAP_TOKEN` para criar o primeiro administrador. Depois disso, o código não é mais aceito para novos cadastros.

## Desenvolvimento

```bash
npm install
npm run dev
```

Verificações:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

O endpoint `GET /api/health` é usado pelo health check da hospedagem.
