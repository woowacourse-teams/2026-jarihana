import { readFileSync } from 'node:fs';

// The source model references this catalog by key; repeated phase queries share one entry.
export const queryCatalog = JSON.parse(readFileSync(new URL('./source/queries.json', import.meta.url), 'utf8'));
const source = JSON.parse(readFileSync(new URL('./source/dashboard.json', import.meta.url), 'utf8'));
export const resolveQuery = reference => {
  const key = reference.slice('@query/'.length);
  if (!reference.startsWith('@query/') || !Object.hasOwn(queryCatalog, key)) throw new Error(`Unknown query reference: ${reference}`);
  return queryCatalog[key];
};
export function canvasQueries(environment) {
  const name = environment === 'prod' ? 'panel-105' : 'panel-5';
  return Object.fromEntries(source.spec.elements[name].spec.data.spec.queries.map(target => [target.spec.refId, resolveQuery(target.spec.query.spec.expr)]));
}
export const queries = canvasQueries('prod');
export const devQueries = canvasQueries('dev');
export const mappingQuery = resolveQuery(source.spec.elements['panel-108'].spec.data.spec.queries[0].spec.query.spec.expr);
