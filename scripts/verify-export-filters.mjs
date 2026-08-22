#!/usr/bin/env node
// Local checks for the three Brais PDF regressions. Does not open LinkedIn.

function repairGluedAboutText(txt) {
  return String(txt)
    .replace(/([.!?])([A-ZÁÉÍÓÚÜÑ¿¡])/g, '$1 $2')
    .replace(/([a-záéíóúüñ])•/gi, '$1 •')
    .replace(/([:;,])•/g, '$1 •');
}

function isPromoEducation(item) {
  const school = String(item.school || '').trim();
  const degree = String(item.degree || '').trim();
  const blob = `${school} ${degree}`.toLowerCase();
  if (!blob.trim()) return true;
  if (/^https?:\/\//i.test(school) || /^https?:\/\//i.test(degree)) return true;
  return /[úu]nete al|join (?:the |our )?campus|estudia programaci|campus de programaci[oó]n|mouredev\.pro|learn programming (?:and|with)/i.test(
    blob,
  );
}

function isEmptyRecommendation(item) {
  const blob = [item.recommenderName, item.recommenderTitle, item.text]
    .filter(Boolean)
    .join(' ');
  return /nothing to see for now|when you add (?:new )?recommendations|recommendations? that .+ will appear here|no recommendations? (?:yet|to show)/i.test(
    blob,
  );
}

const cases = [
  {
    name: 'about glued sentences from Brais PDF',
    ok:
      repairGluedAboutText('tecnología.He trabajado en grandes empresas') ===
        'tecnología. He trabajado en grandes empresas' &&
      repairGluedAboutText('Inditex.En 2014 decido crear') ===
        'Inditex. En 2014 decido crear' &&
      repairGluedAboutText('mí:• Más de 600.000') === 'mí: • Más de 600.000',
  },
  {
    name: 'about keeps a normal sentence',
    ok:
      repairGluedAboutText('Soy freelance. Trabajo en iOS.') ===
      'Soy freelance. Trabajo en iOS.',
  },
  {
    name: 'education drops Brais campus promo',
    ok: isPromoEducation({
      school: 'Únete al campus de programación de la comunidad',
      degree: 'https://mouredev.pro',
    }),
  },
  {
    name: 'education keeps UNED',
    ok: !isPromoEducation({
      school: 'Universidad Nacional de Educación a Distancia - U.N.E.D.',
      degree: 'Ingeniero Informático, Ingeniería informática',
      startDate: '2012',
      endDate: '2016',
    }),
  },
  {
    name: 'recommendations drop empty state from Brais PDF',
    ok: isEmptyRecommendation({
      recommenderName: 'Nothing to see for now',
      text: 'Recommendations that Brais receives will appear here.',
    }),
  },
  {
    name: 'recommendations keep a real quote',
    ok: !isEmptyRecommendation({
      recommenderName: 'Ana Pérez',
      text: 'Brais is a strong engineer and a clear communicator.',
    }),
  },
];

let failed = 0;
for (const c of cases) {
  if (c.ok) {
    console.log(`ok  ${c.name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${c.name}`);
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\n${cases.length} local checks passed`);
