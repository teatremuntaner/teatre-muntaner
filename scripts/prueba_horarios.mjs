// Pruebas de src/lib/schedule.ts:  npm run test:horarios
//
// Los casos salen de funciones reales del 28/08/2026, que es cuando se encontró todo esto:
// «Clap» arrastraba una función pasada, «Corta el cable rojo» del Muntaner fundía dos
// temporadas en una frase de 187 caracteres, y «En ocasiones veo a Umberto» tiene un sábado
// suelto que no es un cambio de horario y que la regla NO debe anunciar.
//
// La fecha de hoy se pasa a mano en cada caso: si no, estas pruebas dejarían de valer al día
// siguiente de escribirlas.

import { summarize, hoyEnMadrid, sumaDias } from '../src/lib/schedule.ts';

// Aqui summarize lleva el idioma en medio; se envuelve para que los casos se lean igual
// que en el Sofia y la unica diferencia sean los que prueban el catalan.
const S = (dates, hoy, lang = 'es') => summarize(dates, lang, hoy);

const HOY = '2026-08-28';
const f = (date, time) => ({ date, time });

// Corta el cable rojo, tal y como estaba: hasta el 5 de septiembre un horario, desde el 11
// otro. Recortado a lo justo para que se lea.
const CCR = [
  f('2026-08-27', '20:00'),                              // pasada: no cuenta
  f('2026-08-28', '19:00'), f('2026-08-28', '21:00'),
  f('2026-08-29', '18:30'), f('2026-08-29', '20:30'),
  f('2026-09-04', '19:00'), f('2026-09-04', '21:00'),
  f('2026-09-05', '18:30'), f('2026-09-05', '20:30'),
  f('2026-09-11', '18:30'), f('2026-09-11', '20:30'),
  f('2026-09-12', '17:00'), f('2026-09-12', '19:00'),
  f('2026-09-18', '18:30'), f('2026-09-18', '20:30'),
  f('2026-09-19', '17:00'), f('2026-09-19', '19:00'),
];

// En ocasiones veo a Umberto: mismo horario todas las semanas MENOS el sábado 31 de octubre,
// que va a las 19:00 en vez de a las 17:00. Es una excepción, no un cambio de horario.
const UMBERTO = [
  f('2026-10-17', '17:00'), f('2026-10-18', '17:00'),
  f('2026-10-24', '17:00'), f('2026-10-25', '17:00'),
  f('2026-10-31', '19:00'),                              // el sábado raro
  f('2026-11-01', '17:00'),
  f('2026-11-07', '17:00'), f('2026-11-08', '17:00'),
];

const CASOS = [
  ['las funciones pasadas no cuentan',
   () => S([f('2026-08-27', '20:00'), f('2026-08-28', '20:30')], HOY).dias,
   (r) => r.length === 1 && r[0].date === '2026-08-28'],

  ['y por eso ya no se anuncia una hora que no existe',
   // esto es «Clap» el 28/08/2026: el jueves 20:00 venía de una función del día anterior
   () => S([f('2026-08-27', '20:00'), f('2026-08-28', '20:30'), f('2026-09-04', '20:30')], HOY).full,
   (r) => r === 'Viernes a las 20:30'],

  ['un solo horario: sale la frase resumen',
   () => S([f('2026-09-04', '20:30'), f('2026-09-11', '20:30')], HOY).full,
   (r) => r === 'Viernes a las 20:30'],

  ['dos horarios: la frase resumen desaparece',
   () => S(CCR, HOY).full,
   (r) => r === ''],

  ['el aviso dice la fecha en que cambia',
   () => S(CCR, HOY).aviso,
   (r) => r === 'Desde el 11 de septiembre el horario cambia'],

  ['sin cambio de horario no hay aviso',
   () => S([f('2026-09-04', '20:30'), f('2026-09-11', '20:30')], HOY).aviso,
   (r) => r === ''],

  ['una excepción suelta NO es un cambio de horario: silencio',
   () => S(UMBERTO, HOY).aviso,
   (r) => r === ''],

  ['con una sola función tampoco hay aviso',
   () => S([f('2026-09-04', '20:30')], HOY).aviso,
   (r) => r === ''],

  ['si despues del corte hay OTRO cambio, silencio',
   // tres viernes con tres horas distintas: no hay dos etapas, hay un lio
   () => S([f('2026-09-04', '19:00'), f('2026-09-11', '20:00'), f('2026-09-18', '21:00')], HOY).aviso,
   (r) => r === ''],

  ['un día con dos pases los trae ordenados por hora',
   () => S([f('2026-08-29', '20:30'), f('2026-08-29', '18:30')], HOY).dias[0].pases,
   (r) => r.length === 2 && r[0].time === '18:30' && r[1].time === '20:30'],

  ['los días salen en orden y con su nombre',
   () => S(CCR, HOY).dias.slice(0, 2),
   (r) => r[0].dow === 'viernes' && r[0].dayMonth === '28 de agosto'
       && r[1].dow === 'sábado' && r[1].dayMonth === '29 de agosto'],

  ['una fecha de otro año lleva el año, para que se sepa de qué enero se habla',
   () => S([f('2027-01-31', '19:00')], HOY).dias[0].dayMonth,
   (r) => r === '31 de enero de 2027'],

  ['sin funciones por venir no se enseña nada',
   () => S([f('2026-08-01', '20:00')], HOY),
   (r) => r.dias.length === 0 && r.full === '' && r.aviso === '' && r.card === 'Consultar fechas'],

  ['la tarjeta de la cartelera también ignora lo pasado',
   () => S([f('2026-08-01', '20:00'), f('2026-09-05', '18:30')], HOY).card,
   (r) => r === '5 de septiembre'],

  ['el hueco para el número de sesión viaja aunque hoy venga vacío',
   () => S([{ date: '2026-09-04', time: '20:30', sessionId: '451196' }], HOY).dias[0].pases[0],
   (r) => r.time === '20:30' && r.sessionId === '451196'],


  // --- lo que encontro Codex en la primera vuelta ---
  ['un cambio de DIAS no se cuenta como un solo horario',
   // primero viernes, despues sabados: la frase decia «Viernes y sabados a las 20:00», que
   // promete las dos cosas todas las semanas
   () => S([f('2026-09-04', '20:00'), f('2026-09-11', '20:00'),
            f('2026-09-19', '20:00'), f('2026-09-26', '20:00')], HOY).full,
   (r) => r === ''],

  ['una funcion suelta distinta AL FINAL no es un cambio de horario',
   // esto anunciaba «Desde el 19 de septiembre el horario cambia» por un solo sabado
   () => S([f('2026-09-05', '17:00'), f('2026-09-12', '17:00'), f('2026-09-19', '19:00')], HOY).aviso,
   (r) => r === ''],

  ['pero si la hora nueva se repite, si es un cambio',
   () => S([f('2026-09-05', '17:00'), f('2026-09-12', '19:00'), f('2026-09-19', '19:00')], HOY).aviso,
   (r) => r === 'Desde el 12 de septiembre el horario cambia'],

  ['una semana de en medio a la que le falta un dia rompe el horario unico',
   () => S([f('2026-09-04', '20:00'), f('2026-09-05', '20:00'),
            f('2026-09-11', '20:00'),
            f('2026-09-18', '20:00'), f('2026-09-19', '20:00')], HOY).full,
   (r) => r === ''],

  ['y si todas las semanas llevan los mismos dias, la frase si sale',
   () => S([f('2026-09-04', '20:00'), f('2026-09-05', '20:00'),
            f('2026-09-11', '20:00'), f('2026-09-12', '20:00'),
            f('2026-09-18', '20:00'), f('2026-09-19', '20:00')], HOY).full,
   (r) => r === 'Viernes y sábados a las 20:00'],

  ['una funcion sin hora no rompe nada',
   () => S([{ date: '2026-09-04' }, f('2026-09-11', '20:00')], HOY).dias[0].pases,
   (r) => r.length === 1 && r[0].time === ''],

  // --- lo que encontro Codex en la segunda vuelta ---
  ['la PRIMERA semana no puede perdonar un dia que si cae dentro del periodo',
   // el sabado 5 va despues del viernes 4, no se lo come el principio del periodo
   () => S([f('2026-09-04', '20:00'),
            f('2026-09-11', '20:00'), f('2026-09-12', '20:00'),
            f('2026-09-18', '20:00'), f('2026-09-19', '20:00')], HOY).full,
   (r) => r === ''],

  ['la ULTIMA semana tampoco',
   // el viernes 25 va antes del sabado 26 y falta
   () => S([f('2026-09-04', '20:00'), f('2026-09-05', '20:00'),
            f('2026-09-11', '20:00'), f('2026-09-12', '20:00'),
            f('2026-09-26', '20:00')], HOY).full,
   (r) => r === ''],

  ['una semana entera sin funcion tambien rompe la frase',
   () => S([f('2026-09-04', '20:00'), f('2026-09-11', '20:00'), f('2026-09-25', '20:00')], HOY).full,
   (r) => r === ''],

  ['pero un periodo que empieza y acaba a media semana si vale',
   // empieza el sabado y acaba el viernes: los huecos de los extremos caen fuera
   () => S([f('2026-09-05', '20:00'),
            f('2026-09-11', '20:00'), f('2026-09-12', '20:00'),
            f('2026-09-18', '20:00')], HOY).full,
   (r) => r === 'Viernes y sábados a las 20:00'],

  ['la tarjeta no pone la hora si el horario no es unico',
   () => S([f('2026-09-04', '20:00'), f('2026-09-11', '20:00'),
            f('2026-09-19', '20:00'), f('2026-09-26', '20:00')], HOY).card,
   (r) => r === 'Viernes y sábados'],

  ['y si lo es, la pone',
   () => S([f('2026-09-04', '20:00'), f('2026-09-11', '20:00')], HOY).card,
   (r) => r === 'Viernes · 20:00'],

  // --- las fechas, que dependian del huso del servidor ---
  ['la fecha de hoy se lee en Madrid, no en el huso del servidor',
   // 23:30 del 23 de marzo en Madrid: en UTC todavia son las 22:30 del mismo dia
   () => hoyEnMadrid(new Date('2027-03-23T22:30:00Z')),
   (r) => r === '2027-03-23'],

  ['y a las 00:30 de Madrid ya es el dia siguiente',
   // 00:30 del 24 en Madrid son las 23:30 del 23 en UTC: antes salia el 23
   () => hoyEnMadrid(new Date('2027-03-23T23:30:00Z')),
   (r) => r === '2027-03-24'],

  ['sumar una semana son siete dias de calendario, tambien en el cambio de hora',
   // la semana del cambio de hora de marzo no dura 168 horas
   () => sumaDias('2027-03-23', 7),
   (r) => r === '2027-03-30'],

  ['y funciona en el cambio de mes y de ano',
   () => [sumaDias('2026-12-28', 7), sumaDias('2026-02-25', 7)],
   (r) => r[0] === '2027-01-04' && r[1] === '2026-03-04'],

  // --- el primer dia a medias, encontrado con los datos reales de esta misma tarde ---
  ['un primer dia truncado no inventa un horario',
   // es «Corta el cable rojo» el 28/08/2026 por la tarde: la taquilla ya habia retirado el
   // pase de las 19:00, asi que ese viernes se quedaba en {21:00} y parecia un tercer patron
   () => S([f('2026-08-28', '21:00'),
            f('2026-08-29', '18:30'), f('2026-08-29', '20:30'),
            f('2026-09-04', '19:00'), f('2026-09-04', '21:00'),
            f('2026-09-05', '18:30'), f('2026-09-05', '20:30'),
            f('2026-09-11', '18:30'), f('2026-09-11', '20:30'),
            f('2026-09-12', '17:00'), f('2026-09-12', '19:00'),
            f('2026-09-18', '18:30'), f('2026-09-18', '20:30'),
            f('2026-09-19', '17:00'), f('2026-09-19', '19:00')], HOY).aviso,
   (r) => r === 'Desde el 11 de septiembre el horario cambia'],

  ['pero ese primer dia se sigue enseñando entero en la lista',
   () => S([f('2026-08-28', '21:00'), f('2026-09-04', '19:00'), f('2026-09-04', '21:00')], HOY).dias[0],
   (r) => r.date === '2026-08-28' && r.pases.length === 1 && r.pases[0].time === '21:00'],

  ['y si el primer dia NO es parte del siguiente, cuenta como siempre',
   // 22:00 no esta entre las horas del viernes siguiente: es otro horario, no un truncado
   () => S([f('2026-08-28', '22:00'),
            f('2026-09-04', '19:00'), f('2026-09-11', '19:00')], HOY).aviso,
   (r) => r === 'Desde el 4 de septiembre el horario cambia'],

  // --- y solo HOY puede venir truncado: lo de mas alla es un horario de verdad ---
  ['un primer dia FUTURO con menos pases no se descarta: es un cambio real',
   () => S([f('2026-09-04', '21:00'),
            f('2026-09-11', '19:00'), f('2026-09-11', '21:00'),
            f('2026-09-18', '19:00'), f('2026-09-18', '21:00')], HOY).aviso,
   (r) => r === 'Desde el 11 de septiembre el horario cambia'],

  ['el dia truncado tampoco contamina la frase ni la tarjeta',
   // con un solo viernes entero detras no hay patron que valga: ni frase, ni hora en la tarjeta
   () => S([f('2026-08-28', '21:00'), f('2026-09-04', '19:00'), f('2026-09-04', '21:00')], HOY),
   (r) => r.full === '' && !r.card.includes('21:00')],

  ['si hoy es el dia del cambio y viene truncado, no se inventa un aviso',
   () => S([f('2026-08-28', '21:00'),
            f('2026-09-04', '19:00'), f('2026-09-04', '21:00'),
            f('2026-09-11', '19:00'), f('2026-09-11', '21:00')], HOY).aviso,
   (r) => r === ''],

  // --- el catalan ---
  ["en catalan el aviso se apostrofa cuando toca: «de l'11»",
   () => S(CCR, HOY, 'ca').aviso,
   (r) => r === "A partir de l'11 de setembre l'horari canvia"],

  // Ojo con estos dos: el cambio tiene que repetirse al menos dos veces, así que los sábados
  // de después van por pares. Con uno solo esto sería una excepción y la regla se callaría.
  ['y no se apostrofa cuando no toca: del 12',
   () => S([f('2026-09-05', '18:30'), f('2026-09-12', '20:30'), f('2026-09-19', '20:30')], HOY, 'ca').aviso,
   (r) => r === "A partir del 12 de setembre l'horari canvia"],

  ['el dia 1 tambien se apostrofa',
   () => S([f('2026-11-24', '18:30'), f('2026-12-01', '20:30'), f('2026-12-08', '20:30')], HOY, 'ca').aviso,
   (r) => r === "A partir de l'1 de desembre l'horari canvia"],

  ['los dias y los meses van en catalan',
   () => S(CCR, HOY, 'ca').dias[0],
   (r) => r.dow === 'divendres' && r.dayMonth === "28 d'agost"],

  ['y la frase resumen tambien',
   () => S([f('2026-09-04', '20:30'), f('2026-09-11', '20:30')], HOY, 'ca').full,
   (r) => r === 'Divendres a les 20:30'],
];

let fallos = 0;
for (const [nombre, ejecuta, comprueba] of CASOS) {
  let ok = false, obtenido;
  try { obtenido = ejecuta(); ok = comprueba(obtenido); } catch (e) { obtenido = String(e); }
  if (!ok) fallos++;
  console.log((ok ? 'OK   ' : 'MAL  ') + nombre);
  if (!ok) console.log('      obtenido ' + JSON.stringify(obtenido));
}
console.log('');
console.log(fallos === 0 ? 'TODAS LAS PRUEBAS PASAN' : fallos + ' PRUEBA(S) FALLAN');
process.exit(fallos ? 1 : 0);
