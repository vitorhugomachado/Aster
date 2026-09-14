# aster

Mapa comercial para importar clientes de fibra por planilha e localizar cada endereço dentro do município selecionado.

## Funcionalidades

- Seletor com os 399 municípios do Paraná e limites oficiais do IBGE.
- Importação de `.xlsx` e `.csv` com `nome`, `logradouro` e `número` obrigatórios.
- Geocodificação automática: CNEFE/IBGE primeiro e Google Geocoding como complemento.
- Revisão ortográfica automática com Gemini quando o endereço não é confirmado; as coordenadas continuam sendo validadas pelo CNEFE/Google.
- Aster IA para consultar clientes, planos, grupos rurais e importações da cidade ativa em linguagem natural.
- Validação estrita de cidade, UF, rua e número para evitar marcadores no município errado.
- Diferenciação entre localização exata, aproximada e pendente.
- Zoom no mapa por rolagem, pinça, botões ou `Ctrl +` / `Ctrl -`, com arraste livre.
- Card completo ao selecionar um cliente, com edição de todos os dados operacionais.
- Cadastro manual e nova tentativa de localização para registros pendentes.
- Importação de telefone, e-mail, documento e contrato sem enviar esses dados ao geocodificador.
- Dados da operação persistidos somente no navegador do usuário.
- Design system documentado em `/design-system`.

## Configuração

Use Node.js 22.13 ou superior e configure as variáveis:

```env
GOOGLE_MAPS_BROWSER_KEY=
GOOGLE_MAPS_GEOCODING_KEY=
GOOGLE_MAPS_ADDRESS_VALIDATION_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
```

A chave de navegador deve ser restrita ao Maps JavaScript API e aos domínios autorizados. A chave de servidor deve ser restrita ao Geocoding API e nunca é enviada ao navegador.

## Desenvolvimento

```bash
npm install
npm run dev
```

Verificações:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

O endpoint `GET /api/health` é usado pelo health check da hospedagem.
