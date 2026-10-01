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
GEOAPIFY_API_KEY=
GOOGLE_MAPS_GEOCODING_KEY=
GOOGLE_MAPS_ADDRESS_VALIDATION_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
GEMINI_MODEL=gemini-3.1-flash-lite
DATABASE_URL=
ASTER_BOOTSTRAP_TOKEN=
GOOGLE_MAPS_ROUTES_KEY=
```

A chave de navegador deve ser restrita ao Maps JavaScript API e aos domínios autorizados. A chave de servidor deve ser restrita ao Geocoding API e nunca é enviada ao navegador.

Na primeira execução com banco configurado, a tela de acesso solicita o `ASTER_BOOTSTRAP_TOKEN` para criar o primeiro administrador. Depois disso, o código não é mais aceito para novos cadastros.

Com GEOAPIFY_API_KEY configurada, o sistema usa IBGE/CNEFE e Geoapify, sem recorrer ao Google para geocodificação. Com GROQ_API_KEY, a Groq dá a decisão final, inclusive para candidatos de baixa confiança; não há bloqueio obrigatório em 0,95. As chaves permanecem no .env.local ignorado pelo Git.

## Desenvolvimento

O endpoint `/api/geocode` coleta candidatos IBGE/Geoapify e consulta a Groq para a decisão final: confirmar, revisar ou não localizado. Confiança do provedor é apenas evidência interna. A IA seleciona somente pontos existentes, com número e rua correspondentes; município/UF e coordenadas são verificados pelo servidor. Uma busca adicional por nomenclatura corrigida é permitida. O número nunca é alterado; ausência de correspondência gera Numeração não localizada. Falhas de IA mantêm revisão e sugestão. A resposta inclui decision, confirmationSource, selectedCandidateId, aiReviewNote e correctedAddress. Precisão e confirmação são independentes; a interface mostra Confirmado pela IA e conserva o histórico das decisões.

Com `GROQ_API_KEY` configurada, a revisão de endereços e o Aster IA usam Groq, sem fallback para Gemini. A revisão recebe apenas campos de endereço e candidatos do IBGE. A IA decide entre candidatos coletados; não cria coordenadas nem altera números. Consulte as cotas do plano gratuito no console Groq.

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

## Supabase e Vercel

Produção usa Next.js. Configure DATABASE_URL com o Transaction pooler Supabase (porta 6543), ASTER_BOOTSTRAP_TOKEN e as chaves de API no ambiente da Vercel. Use APP_URL para o domínio público. Execute npm run db:setup para aplicar supabase/migrations/202610010001_aster.sql. vercel.json define o preset Next.js e região iad1; .env.local não é versionado.

