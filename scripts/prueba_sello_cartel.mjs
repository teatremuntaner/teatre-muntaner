// Pruebas de selloCartel (src/lib/disponibilidad.ts):  npm run test:sello
//
// El sello del cartel resume todas las funciones por venir (Carlos, 05/11/2026). La fecha de
// hoy va a mano para que las pruebas no caduquen.

import { selloCartel } from '../src/lib/disponibilidad.ts';

const HOY = '2026-11-05';
const f = (date, time) => ({ date, time });
const m = (date, time, estado) => ({ date, time, estado });
const DATES = [f('2026-11-04', '20:00'), f('2026-11-06', '20:00'), f('2026-11-07', '18:00'), f('2026-11-07', '20:30')];

let fallos = 0;
const caso = (nombre, d, esperado, n) => {
  const r = selloCartel({ dates: DATES, ...d }, HOY);
  const ok = r.estado === esperado && (n === undefined || r.funciones.length === n);
  if (!ok) fallos++;
  console.log(`${ok ? 'bien ' : 'FALLO'}  ${nombre}: ${r.estado} (${r.funciones.length})`);
};

caso('ninguna con aviso', {}, null, 0);
caso('una agotada y el resto sin aviso', { ventaQwantic: [m('2026-11-06', '20:00', 'agotada')] }, null, 0);
caso('una agotada y otra en últimas', {
  ventaQwantic: [m('2026-11-06', '20:00', 'agotada'), m('2026-11-07', '20:30', 'ultimas')],
}, 'ultimas', 1);
caso('todas agotadas (la pasada no cuenta)', {
  ventaQwantic: [m('2026-11-06', '20:00', 'agotada'), m('2026-11-07', '18:00', 'agotada'), m('2026-11-07', '20:30', 'agotada')],
}, 'agotada', 3);
caso('a mano manda: «normal» deshace el todo agotado', {
  ventaQwantic: [m('2026-11-06', '20:00', 'agotada'), m('2026-11-07', '18:00', 'agotada'), m('2026-11-07', '20:30', 'agotada')],
  ventaManual: [m('2026-11-07', '20:30', 'normal')],
}, null, 0);
caso('a mano, día entero agotado + otra en últimas', {
  ventaManual: [m('2026-11-07', undefined, 'Agotada'), m('2026-11-06', '20:00', 'Últimas entradas')],
}, 'ultimas', 1);
caso('a mano cierra todo', { ventaManual: [m('2026-11-06', undefined, 'agotada'), m('2026-11-07', undefined, 'agotada')] }, 'agotada', 3);
caso('sin funciones por venir', { dates: [f('2026-11-01', '20:00')], ventaQwantic: [m('2026-11-01', '20:00', 'agotada')] }, null, 0);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO BIEN');
process.exit(fallos ? 1 : 0);
