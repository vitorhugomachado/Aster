import { readSheet } from 'read-excel-file/node';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Informe ao menos uma planilha.');

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

const aliases = {
  name: ['nome', 'nome_cliente', 'cliente', 'razao_social'],
  street: ['logradouro', 'rua', 'endereco', 'endereco_completo'],
  number: ['numero', 'numero_endereco', 'n', 'nr'],
};

for (const path of paths) {
  const rows = await readSheet(path);
  const headers = rows[0].map(normalize);
  const indexes = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [
    field,
    headers.findIndex((header) => names.includes(header)),
  ]));
  const missingColumns = Object.entries(indexes).filter(([, index]) => index < 0).map(([field]) => field);
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim()));
  const candidateRows = dataRows.filter((row) => {
    return Object.values(indexes).some((index) => index >= 0 && String(row[index] ?? '').trim());
  });
  const validRows = candidateRows.filter((row) => {
    return Object.values(indexes).every((index) => index >= 0 && String(row[index] ?? '').trim());
  });

  console.log(JSON.stringify({
    file: path.split(/[\\/]/).pop(),
    missingColumns,
    candidateRows: candidateRows.length,
    validRows: validRows.length,
    rejectedRows: candidateRows.length - validRows.length,
  }));
}
