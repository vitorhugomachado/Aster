# FibraMapa

Mapa comercial para importar clientes de fibra por planilha e localizar cada endereço dentro do município selecionado.

## Funcionalidades

- Seletor com os 399 municípios do Paraná e limites oficiais do IBGE.
- Importação de `.xlsx` e `.csv` com `nome`, `logradouro` e `número` obrigatórios.
- Geocodificação automática: CNEFE/IBGE primeiro e Google Geocoding como complemento.
- Validação estrita de cidade, UF, rua e número para evitar marcadores no município errado.
- Diferenciação entre localização exata, aproximada e pendente.
- Dados da operação persistidos somente no navegador do usuário.
- Design system documentado em `/design-system`.

## Configuração

Use Node.js 22.13 ou superior e configure as variáveis:

```env
GOOGLE_MAPS_BROWSER_KEY=
GOOGLE_MAPS_GEOCODING_KEY=
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
