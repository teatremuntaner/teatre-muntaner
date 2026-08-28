// Resume las funciones de un espectáculo para la cartelera y para su ficha.
//
// Las frases se construyen aquí (no en el diccionario de i18n) porque dependen de la
// gramática de cada idioma: plurales, conjunción y contracciones.
//
// SOLO CUENTAN LAS FUNCIONES POR VENIR. Las pasadas se descartan aquí dentro, en un solo
// sitio, y no en cada pantalla. Antes se resumían todas, y eso hacía que una ficha anunciara
// horarios que ya no existían: el 28/08/2026, «Clap» en el Sofía decía «jueves a las 20:00»
// porque arrastraba una función del 27 de agosto que ya se había dado.
//
// Devuelve tres cosas y cada una tiene su sitio:
//   · `dias`  — las funciones por venir, agrupadas por día. Es lo que enseña la ficha, y es
//               lo único que contesta la pregunta que trae quien entra: ¿cuándo puedo ir?
//               Cada hora va pegada a su fecha, así que no puede ser falsa.
//   · `full`  — la frase de siempre («Viernes a las 19:00 y sábados a las 21:00»), pero SOLO
//               cuando hay un único horario de aquí al final. El porqué, más abajo.
//   · `card`  — la versión compacta para la tarjeta de la cartelera.
//
// POR QUÉ `full` DESAPARECE CUANDO HAY MÁS DE UN HORARIO. Un resumen por días de la semana
// solo contesta la pregunta cuando el horario es estable. Con dos horarios funde los dos en
// una frase que no describe ningún día concreto. El 28/08/2026 la ficha de «Corta el cable
// rojo» decía de una tirada: «Sábados y domingos a las 17:00, viernes y sábados a las 18:30,
// viernes, sábados y domingos a las 19:00, miércoles y jueves a las 20:00, viernes y sábados
// a las 20:30 y viernes a las 21:00». 187 caracteres. Ninguna de esas franjas era mentira,
// pero el viernes siguiente no era a las 18:30, y quien lo avisó fue Oriol desde la taquilla.

import type { Lang } from '../i18n';

export type Session = { date: string; time?: string; sessionId?: string };

/** Un pase concreto. `sessionId` viaja vacío hoy: la ficha solo guarda fecha y hora. Cuando
 *  el sincronizador de Qwantic lo traiga, cada hora podrá enlazar a comprar ESA función sin
 *  tener que rehacer nada de aquí. */
export interface Pase { time: string; sessionId?: string }

export interface DiaConFuncion {
  date: string;       // ISO, para ordenar y para el atributo datetime
  dow: string;        // "viernes" / "divendres"
  dayMonth: string;   // "28 de agosto" / "28 d'agost"
  pases: Pase[];
}

interface Locale {
  dow: string[];
  dowShort: string[];
  month: string[];
  monthShort: string[];
  y: string;              // conjunción final ("y" / "i")
  aLas: string;           // "a las" / "a les"
  consultar: string;      // "Consultar fechas" / "Consultar dates"
  /** Une "3" y "abril" -> "3 de abril" / "3 d'abril" (elisión catalana). */
  dayOfMonth: (day: number, month: string) => string;
  /** El aviso de cambio de horario, ya montado. `day` viene aparte porque en catalán la
   *  contracción depende de cómo suena el número: «a partir de l'11», «a partir del 12». */
  cambio: (dayMonth: string, day: number) => string;
  /** Los días seguidos: «De miércoles a domingo» / «De dimecres a diumenge». En catalán se
   *  escribe igual que en castellano porque todos los días empiezan por «di-»: no hay
   *  elisión que hacer. Va en el diccionario de todos modos, para no dar por hecho que
   *  seguirá coincidiendo si algún día se traduce a otro idioma. */
  deA: (primero: string, ultimo: string) => string;
}

const LOCALES: Record<Lang, Locale> = {
  es: {
    dow: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    dowShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    month: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    monthShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    y: 'y',
    aLas: 'a las',
    consultar: 'Consultar fechas',
    dayOfMonth: (day, month) => `${day} de ${month}`,
    cambio: (dayMonth) => `Desde el ${dayMonth} el horario cambia`,
    deA: (primero, ultimo) => `De ${primero} a ${ultimo}`,
  },
  ca: {
    dow: ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'],
    dowShort: ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'],
    month: ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'],
    monthShort: ['gen', 'feb', 'març', 'abr', 'maig', 'juny', 'jul', 'ago', 'set', 'oct', 'nov', 'des'],
    y: 'i',
    aLas: 'a les',
    consultar: 'Consultar dates',
    // En catalán "de" se apostrofa ante vocal: 1 de gener, però 2 d'abril.
    dayOfMonth: (day, month) =>
      /^[aeiouàèéíòóú]/i.test(month) ? `${day} d'${month}` : `${day} de ${month}`,
    // Solo el 1 (u) y el 11 (onze) empiezan por vocal al pronunciarlos, así que solo ellos
    // llevan «de l'»; el resto van con «del».
    cambio: (dayMonth, day) =>
      day === 1 || day === 11
        ? `A partir de l'${dayMonth} l'horari canvia`
        : `A partir del ${dayMonth} l'horari canvia`,
    deA: (primero, ultimo) => `De ${primero} a ${ultimo}`,
  },
};

const dateOf = (iso: string) => new Date(iso + 'T00:00:00');
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// Vale para los dos idiomas: los días acabados en -s son invariables
// (lunes/martes en es; dilluns/dimarts/dimecres/dijous/divendres en ca).
const plural = (name: string) => (name.endsWith('s') ? name : name + 's');
// Lunes primero
const monKey = (dow: number) => (dow + 6) % 7;

/** El horario de una tanda de días: qué horas tiene cada día de la semana.
 *  Devuelve null si un mismo día de la semana aparece con horas distintas, es decir, si esa
 *  tanda no tiene UN horario sino varios. */
function horario(dias: DiaConFuncion[]): Map<number, string> | null {
  const mapa = new Map<number, string>();
  for (const d of dias) {
    const wd = dateOf(d.date).getDay();
    const horas = d.pases.map((p) => p.time).join('|');
    const previo = mapa.get(wd);
    if (previo !== undefined && previo !== horas) return null;
    mapa.set(wd, horas);
  }
  return mapa;
}

const mismoHorario = (a: Map<number, string>, b: Map<number, string>): boolean =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

/** La fecha en ISO SIN pasar por UTC: toISOString() sobre una fecha a medianoche local
 *  devuelve el día anterior en horario de verano. */
function isoDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const lunesDe = (iso: string): Date => {
  const d = dateOf(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

/* ¿HAY DE VERDAD UN ÚNICO HORARIO?
 *
 * «Viernes a las 19:00 y sábados a las 21:00» es una promesa: todos los viernes y todos los
 * sábados. Así que se comprueba entera, y hacen falta dos cosas.
 *
 * La primera: que cada día de la semana tenga siempre las mismas horas. Sin eso, «Corta el
 * cable rojo» fundía sus dos temporadas en una frase de 187 caracteres.
 *
 * La segunda, que costó dos vueltas de Codex: que NO FALTE NINGÚN DÍA. Con solo lo anterior,
 * «viernes 7 y 14, sábados 22 y 29», todos a las 20:00, pasaba por horario único y la frase
 * prometía viernes Y sábados todas las semanas cuando primero fueron unos y luego los otros.
 * Y con la primera versión de esta comprobación seguían colándose los huecos: una semana
 * entera sin función, o un día que falta justo en la primera o la última semana.
 *
 * Así que se recorre semana a semana desde la primera función hasta la última, y cada día
 * del patrón tiene que estar. Solo se perdona lo que cae fuera del periodo por los extremos:
 * si la temporada empieza un viernes, el sábado anterior no cuenta como hueco.
 *
 * ESTO ES ESTRICTO A PROPÓSITO, Y AQUÍ ESTÁ MEDIDO LO QUE CUESTA. El 28/08/2026, entre las
 * dos casas había 51 fichas. Diez no tenían ninguna función por venir y dieciséis tenían
 * una sola: donde una frase puede existir siquiera es en 25. De esas 25, la enseñan 9.
 *
 * LAS DIECISÉIS QUE SE QUEDAN SIN ELLA NO SON UN DEFECTO QUE ARREGLAR. Son montajes sin
 * semana regular: un sábado al mes, o tres funciones sueltas en tres semanas. No hay
 * patrón que resumir, y «Sábados a las 19:00» prometería funciones que no existen. Sus
 * fechas se ven una a una en la lista de debajo, que para eso está.
 *
 * Así que si alguien llega aquí dentro de seis meses porque «la frase sale en pocas
 * fichas»: el número no se sube aflojando esta comprobación. Aflojarla no hace que salga
 * más veces, hace que salga mintiendo, que es de donde venimos. */
/** `limite`, si viene, es la fecha del cambio de horario: el tramo se comprueba HASTA ahí,
 *  no hasta su última función. Sin eso, si desaparecían todos los días de la última semana
 *  antes del cambio, el periodo terminaba antes de tiempo y esos huecos no se veían: la
 *  frase prometía un miércoles y un jueves que no existen. (Codex, 28/08/2026.) */
function unicoHorario(dias: DiaConFuncion[], limite?: string): boolean {
  if (!horario(dias)) return false;
  if (dias.length < 2) return true;
  const presentes = new Set(dias.map((d) => d.date));
  const patron = new Set(dias.map((d) => dateOf(d.date).getDay()));
  const primera = dias[0].date;
  const ultima = dias[dias.length - 1].date;
  const finDeSemanas = isoDe(lunesDe(limite ?? ultima));
  for (let w = lunesDe(primera); isoDe(w) <= finDeSemanas; w.setDate(w.getDate() + 7)) {
    for (const wd of patron) {
      const d = new Date(w);
      d.setDate(d.getDate() + ((wd + 6) % 7));
      const iso = isoDe(d);
      if (iso < primera) continue;                          // antes de empezar: no es hueco
      if (limite ? iso >= limite : iso > ultima) continue;   // ya es del horario nuevo
      if (!presentes.has(iso)) return false;
    }
  }
  return true;
}

/* EL PRIMER DÍA PUEDE ESTAR A MEDIAS, y eso no es un horario.
 *
 * La taquilla va retirando las funciones según se dan. Así que a las ocho de la tarde de un
 * viernes de dos pases, la ficha ya solo tiene el de las 21:00 de ese día: el de las 19:00
 * ya se ha hecho. Ese viernes truncado parecía entonces un horario distinto del de los
 * viernes siguientes, y el aviso se callaba porque veía tres patrones de viernes donde solo
 * hay dos.
 *
 * Pasó de verdad, con «Corta el cable rojo», la misma tarde del cambio: el sincronizador
 * quitó el pase de las 19:00 del 28 de agosto y el aviso del 11 de septiembre desapareció.
 *
 * Así que si el primer día lleva un juego de horas que es parte del que tiene ese mismo día
 * de la semana más adelante, no se le hace caso para decidir el patrón. Sigue viéndose en la
 * lista, que es donde tiene que estar: quien entre esta tarde verá su función de las 21:00. */
function sinElPrimeroAMedias(dias: DiaConFuncion[], hoy: string): DiaConFuncion[] {
  if (dias.length < 2) return dias;
  const primero = dias[0];

  // SOLO HOY puede estar truncado, porque lo trunca el paso de las horas. Si el primer día
  // de la ventana es de la semana que viene y tiene menos pases, eso es un horario distinto
  // y hay que contarlo. Lo señaló Codex: sin esta línea, un viernes 4 con un solo pase se
  // descartaba y el cambio real del 11 se quedaba sin avisar.
  if (primero.date !== hoy) return dias;

  const wd = dateOf(primero.date).getDay();
  const siguiente = dias.slice(1).find((d) => dateOf(d.date).getDay() === wd);
  if (!siguiente) return dias;

  // Y lo que queda tiene que ser el FINAL del horario completo, no cualquier trozo: la
  // taquilla retira los pases por orden, así que de «19:00 y 21:00» puede quedar «21:00»,
  // pero nunca «19:00» a solas.
  const suyas = primero.pases.map((p) => p.time);
  const completas = siguiente.pases.map((p) => p.time);
  const cola = completas.slice(completas.length - suyas.length);
  const esElFinalDe = suyas.length < completas.length && suyas.every((h, i) => h === cola[i]);
  return esElFinalDe ? dias.slice(1) : dias;
}

export interface ScheduleSummary {
  card: string;              // compacto para la cartelera
  full: string;              // el patrón, SOLO si hay un único horario de aquí al final
  loose: string[];           // fechas sueltas que no encajan en el patrón
  hasPattern: boolean;
  dias: DiaConFuncion[];     // las funciones por venir, por día: lo que enseña la ficha
  aviso: string;             // "A partir de l'11 de setembre l'horari canvia", o vacío
}

/* El día de hoy EN MADRID, que es donde se decide la programación de las dos casas.
 *
 * Con toISOString() esto salía en UTC, y entre la medianoche y las dos de la mañana de aquí
 * todavía devolvía el día anterior: la ficha enseñaba una función que ya se había dado. Lo
 * señaló Codex el 28/08/2026.
 *
 * Se compara por FECHA y no por hora a propósito: la web es estática y se construye al
 * desplegar, así que afinar a la hora sería precisión de mentira. Una función de hoy se
 * sigue enseñando todo el día, que además es lo que la gente espera. */
export const hoyEnMadrid = (ahora: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(ahora);

/** Suma días a una fecha civil (AAAA-MM-DD) y devuelve otra fecha civil.
 *
 *  Sobre la CADENA y no sobre un Date, y en UTC, porque un `setDate()` sumaría días en el
 *  huso del servidor —en Netlify, UTC— y la madrugada del cambio de hora de marzo devolvía
 *  un día de más: el 23/03/2027 a las 23:30 de Madrid, «dentro de una semana» salía 31 en
 *  vez de 30. Aquí no interviene ningún huso: son días de calendario y ya está.
 *  Lo encontró Codex el 28/08/2026, y la corrección de antes tampoco valía. */
export function sumaDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

const HOY = hoyEnMadrid;

/** Los días del horario, sin las horas, lo más corto que se pueda: «De miércoles a
 *  domingo» cuando van seguidos, «Miércoles, viernes y sábados» cuando no. */
function soloLosDias(mapa: Map<number, string>, L: Locale): string {
  const dows = [...mapa.keys()].sort((a, b) => monKey(a) - monKey(b));
  const seguidos = dows.length >= 3 && dows.every((d, i) => i === 0 || monKey(d) === monKey(dows[i - 1]) + 1);
  const nombres = dows.map((d) => plural(L.dow[d]));
  const lista = nombres.length < 2 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} ${L.y} ${nombres[nombres.length - 1]}`;
  return seguidos ? L.deA(L.dow[dows[0]], L.dow[dows[dows.length - 1]]) : cap(lista);
}

/** `hoy` se puede pasar para poder probar esto sin depender del día en que se ejecute. */
export function summarize(sessions: Session[] = [], lang: Lang = 'es', hoy: string = HOY()): ScheduleSummary {
  const L = LOCALES[lang] ?? LOCALES.es;

  const joinY = (arr: string[]): string => {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ` ${L.y} ` + arr[arr.length - 1];
  };
  /** "28 d'agost", y "31 de gener de 2027" cuando la fecha cae en otro año. Sin el año, una
   *  lista consultada en agosto que dice «diumenge 31 de gener» no aclara de qué enero habla. */
  const dayMonthFull = (iso: string): string => {
    const d = dateOf(iso);
    const base = L.dayOfMonth(d.getDate(), L.month[d.getMonth()]);
    return d.getFullYear() === +hoy.slice(0, 4) ? base : `${base} de ${d.getFullYear()}`;
  };
  const looseLabel = (iso: string): string => {
    const d = dateOf(iso);
    return `${L.dowShort[d.getDay()]} ${d.getDate()} ${L.monthShort[d.getMonth()]}`;
  };

  /** Agrupa por día y ordena: un día es una fecha con sus pases, del primero al último. */
  const porDia = (lista: Session[]): DiaConFuncion[] => {
    const mapa = new Map<string, Pase[]>();
    for (const s of lista) {
      const pases = mapa.get(s.date) ?? mapa.set(s.date, []).get(s.date)!;
      pases.push({ time: s.time || '', sessionId: s.sessionId });
    }
    return [...mapa.keys()].sort().map((date) => ({
      date,
      dow: L.dow[dateOf(date).getDay()],
      dayMonth: dayMonthFull(date),
      pases: mapa.get(date)!.sort((a, b) => a.time.localeCompare(b.time)),
    }));
  };

  /* EL AVISO DE CAMBIO DE HORARIO.
   *
   * Esto pasa dos veces al año por lo menos: acaba el verano, empieza la temporada, y el
   * mismo espectáculo cambia de horas. Una lista de fechas no avisa de eso, y quien mira
   * solo la semana que viene se lleva la sorpresa después.
   *
   * LA REGLA, escrita para que quien la lea dentro de seis meses entienda POR QUÉ se calla y
   * no la «arregle» para que hable:
   *   · solo se miran las funciones por venir;
   *   · el corte es la primera fecha en la que un día de la semana repite con otras horas;
   *   · de ahí en adelante tiene que haber UN solo horario, distinto del de antes;
   *   · y el día que cambia tiene que repetir la hora nueva al menos dos veces;
   *   · si algo de eso falla, NO SE ESCRIBE NADA.
   *
   * Ese silencio es la parte importante. Medida sobre los 42 espectáculos con funciones por
   * venir de las dos casas el 28/08/2026, la regla avisó en dos y los dos eran ciertos,
   * comprobados contra la taquilla. En «En ocasiones veo a Umberto», del Sofía, se calló, y
   * hacía bien: su horario no cambia, lo que hay es un sábado suelto, el 31 de octubre, que
   * va a las 19:00 en vez de a las 17:00. Eso no es un cambio de horario que anunciar, es
   * una excepción, y se ve sola en la lista de fechas cuando llega. Admitir excepciones aquí
   * sería abrirle la puerta otra vez a una frase que miente, que es de donde venimos.
   *
   * Una frase. Nunca dos. Si no hay un corte limpio, ninguna. */
  const corteDeHorario = (dias: DiaConFuncion[]): { corte: number; anunciable: boolean } => {
    const NADA = { corte: -1, anunciable: false };
    if (dias.length < 2) return NADA;

    // El corte: la primera fecha en la que un día de la semana repite con otras horas. Todo
    // lo anterior es regular por construcción, porque el corte es justo la primera vez que
    // deja de serlo; por eso aquí no hace falta comprobarlo.
    const visto = new Map<number, string>();
    let corte = -1;
    for (let i = 0; i < dias.length; i++) {
      const wd = dateOf(dias[i].date).getDay();
      const horas = dias[i].pases.map((p) => p.time).join('|');
      if (visto.has(wd) && visto.get(wd) !== horas) { corte = i; break; }
      visto.set(wd, horas);
    }
    if (corte < 0) return NADA;                            // un solo horario: nada que avisar

    const desde = dias.slice(corte);
    const horarioDesde = horario(desde);
    // A partir de aqui el cambio existe pero puede no ser anunciable. El corte se devuelve
    // igual: sirve para saber hasta donde llega el horario de esta semana.
    if (!horarioDesde) return { corte, anunciable: false };  // hay un segundo corte: silencio
    if (mismoHorario(horario(dias.slice(0, corte))!, horarioDesde)) return { corte, anunciable: false };

    /* Y UNA PRUEBA MÁS, la que pedía el caso de la función suelta al final. Con «sábados 1 y
     * 8 a las 17:00, sábado 15 a las 19:00» todo lo de arriba se cumplía —lo de después era
     * un solo sábado, o sea regular sin esforzarse— y se anunciaba un cambio de horario a
     * partir de una única función. Lo encontró Codex el 28/08/2026.
     *
     * Así que el día que cambia tiene que repetir la hora nueva AL MENOS DOS VECES. Una
     * función suelta distinta es una excepción y no se anuncia; ya se ve sola en su fecha. */
    const diaQueCambia = dateOf(dias[corte].date).getDay();
    const veces = desde.filter((d) => dateOf(d.date).getDay() === diaQueCambia).length;
    if (veces < 2) return { corte, anunciable: false };

    return { corte, anunciable: true };
  };

  const list = (sessions ?? []).filter((s) => s && s.date && s.date >= hoy);
  if (!list.length)
    return { card: L.consultar, full: '', loose: [], hasPattern: false, dias: [], aviso: '' };

  const dias = porDia(list);
  // El patrón se decide sin el primer día si viene a medias (ver sinElPrimeroAMedias). La
  // lista, `dias`, se queda entera: esa función de esta tarde hay que seguir enseñándola.
  const paraElPatron = sinElPrimeroAMedias(dias, hoy);
  const { corte, anunciable } = corteDeHorario(paraElPatron);
  const aviso = anunciable ? L.cambio(paraElPatron[corte].dayMonth, dateOf(paraElPatron[corte].date).getDate()) : '';

  /* EL HORARIO VIGENTE: de hoy hasta el próximo cambio, y nada más.
   *
   * La frase resumen intentaba antes describir TODAS las funciones por venir de una vez, y
   * por eso o mentía (las dos temporadas de «Corta el cable rojo» fundidas en 187
   * caracteres) o se callaba en 12 de las 15 fichas que la tenían.
   *
   * Ahora describe solo el tramo que va de hoy al corte. Es corta, sale casi siempre, y
   * sobre todo es cierta HOY, que es lo único que no se puede perder. Del resto avisa la
   * línea de arriba, y las fechas exactas están debajo en la lista.
   *
   * El corte se usa aunque el cambio no se pueda anunciar: si más adelante hay algo que no
   * sabemos contar, con más razón la frase tiene que hablar solo de lo de aquí. Y dentro del
   * tramo se sigue exigiendo horario único de verdad, semana a semana: si ni siquiera esto
   * es regular, no hay frase. (Carlos, 28/08/2026: «que salga más a menudo, aunque
   * simplifique» — pero simplificar nunca es decir algo que hoy sea falso.) */
  /* SE PROBÓ A MEDIRLO POR SEMANAS ENTERAS Y ERA MENTIRA. El cambio cae a mitad de semana,
   * así que la última semana del tramo está partida y le faltan días; dejarla fuera de la
   * comprobación le daba frase a dos espectáculos más, y por eso se hizo. Pero también
   * escondía los huecos de esa semana que son ANTERIORES al cambio: con «miércoles, jueves
   * y viernes a las 20:00» y un miércoles 9 que no existe, la frase prometía ese miércoles.
   * Lo encontró Codex el 28/08/2026. El tramo llega hasta el corte y se comprueba entero. */
  const vigentes = corte >= 0 ? paraElPatron.slice(0, corte) : paraElPatron;
  const hastaDonde = corte >= 0 ? paraElPatron[corte].date : undefined;

  // El patrón entero -- la frase, la hora de la tarjeta y las fechas sueltas -- se calcula
  // sobre el tramo vigente. `dias` sigue entero: la lista de fechas las enseña todas.
  const paraContar = vigentes.flatMap((d) => d.pases.map((p) => ({ date: d.date, time: p.time })));

  // Agrupa por (día de la semana | hora)
  const combos = new Map<string, string[]>();
  for (const s of paraContar) {
    const key = `${dateOf(s.date).getDay()}|${s.time || ''}`;
    (combos.get(key) ?? combos.set(key, []).get(key)!).push(s.date);
  }

  const recurring: { dow: number; time: string }[] = [];
  const looseIsos: string[] = [];
  for (const [key, isos] of combos) {
    const [dowStr, time] = key.split('|');
    if (isos.length >= 2) recurring.push({ dow: +dowStr, time });
    else looseIsos.push(...isos);
  }

  /* LA FRASE SE AGRUPA POR EL HORARIO DE CADA DÍA, no por hora suelta.
   *
   * Antes se agrupaba al revés, juntando los días que comparten una hora, y con dos pases
   * diarios salía «Sábados a las 18:30, viernes a las 19:00, sábados a las 20:30 y viernes
   * a las 21:00»: 84 caracteres para decir dos cosas. Agrupando por día sale «Viernes a las
   * 19:00 y 21:00; sábados a las 18:30 y 20:30». Cuando solo hay un pase al día el
   * resultado es el de siempre: «Viernes y sábados a las 20:00». */
  // Y sale del horario del tramo, no de contar repeticiones. Contarlas dejaba sin frase a
  // los tramos de una sola semana -- ahi nada se repite dos veces -- que son justo los que
  // mas falta hacia describir. Lo que garantiza que esto es cierto es unicoHorario, que
  // comprueba el tramo semana a semana y sin huecos.
  const mapa = horario(vigentes);

  const grupos = new Map<string, number[]>();
  for (const [dow, horas] of mapa ?? []) (grupos.get(horas) ?? grupos.set(horas, []).get(horas)!).push(dow);

  const phrases = [...grupos.entries()]
    .map(([clave, dows]) => ({
      horas: clave ? clave.split(String.fromCharCode(124)) : [],
      dows: dows.sort((a, b) => monKey(a) - monKey(b)),
    }))
    .sort((a, b) => monKey(a.dows[0]) - monKey(b.dows[0]))
    .map(({ horas, dows }) => {
      const names = joinY(dows.map((d) => plural(L.dow[d])));
      return horas.length ? `${names} ${L.aLas} ${joinY(horas)}` : names;
    });

  // Las horas de todo el tramo, para decidir si la tarjeta puede llevar una.
  const horasTodas = [...new Set(recurring.map((r) => r.time))];
  // La frase solo sale si todos los días por venir comparten un mismo horario, y eso se
  // comprueba también semana a semana (ver unicoHorario).
  // Los grupos van con punto y coma: con «y» entre ellos y «y» dentro se lee fatal.
  // Con un solo dia por delante no hay horario que resumir: la fecha lo dice mejor, y una
  // frase en plural a partir de un unico dia promete una semana que no existe.
  const conHoras = mapa && vigentes.length >= 2 && unicoHorario(vigentes, hastaDonde) ? cap(phrases.join('; ')) : '';

  /* Y SI SE PASA DE 60 CARACTERES, SOLO LOS DÍAS: «De miércoles a domingo».
   *
   * Un espectáculo de cinco días con tres franjas necesita 83 caracteres para contarse
   * entero, y eso vuelve a ser el ladrillo del que venimos, aunque ahora sea cierto.
   *
   * LAS HORAS NO SE PIERDEN: están una por una en la lista de fechas, justo debajo, que es
   * donde se miran de verdad. Lo que hace falta saber aquí arriba es si el espectáculo cae
   * en el día que a uno le viene bien. (Decidido por Carlos el 28/08/2026.)
   *
   * El límite es de presentación, no de verdad: las dos frases dicen lo mismo, una con más
   * detalle que la otra. Por eso se puede tocar sin miedo; lo que no se puede tocar es la
   * condición de arriba, que es la que decide si hay algo cierto que decir. */
  /* Y SI HAY CAMBIO PERO NO SE PUEDE ANUNCIAR, NO HAY FRASE.
   *
   * Con «sábados 5 y 12 a las 17:00, sábado 19 a las 19:00» el corte existe pero no se
   * anuncia: una función suelta distinta es una excepción, no un cambio de temporada. La
   * frase se calculaba entonces sobre lo de antes del corte y decía «Sábados a las 17:00»,
   * sin que nada le pusiera fecha de caducidad al lector. El sábado 19 la desmiente.
   *
   * Así que cuando el corte no se puede contar, la frase se calla y mandan las fechas.
   * (Codex, 28/08/2026.) */
  const corteMudo = corte >= 0 && !anunciable;
  const conFecha = corteMudo ? '' : conHoras.length > 60 ? soloLosDias(mapa!, L) : conHoras;

  /* CUANDO NO SE PUEDEN PROMETER LAS HORAS, LOS DÍAS A VECES SÍ.
   *
   * «En ocasiones veo a Umberto» hace de miércoles a domingo todas las semanas hasta enero.
   * Lo único que se le mueve es un sábado, el 31 de octubre, que va a las 19:00 en vez de a
   * las 17:00: una excepción, que no se anuncia y que por eso deja la frase con horas sin
   * fecha de caducidad. Pero esa excepción no toca los DÍAS, y los días es justo lo que
   * hace falta saber aquí arriba: si cae el día que a uno le viene bien.
   *
   * Así que se vuelve a comprobar lo mismo, con la misma exigencia de semana a semana y sin
   * huecos, pero mirando solo los días. Si el reparto de días aguanta el periodo entero, la
   * frase los dice. Y si tampoco aguanta -- «Clap» pierde un jueves, «Corta el cable rojo»
   * un miércoles --, no se dice nada: no hay semana que resumir. */
  const sinHoras = paraElPatron.map((d) => ({ ...d, pases: [{ time: '' }] }));
  const diasEstables = paraElPatron.length >= 2 && unicoHorario(sinHoras);
  const full = conFecha || (diasEstables ? soloLosDias(horario(sinHoras)!, L) : '');

  const looseSorted = [...new Set(looseIsos)].sort();
  const loose = looseSorted.map(looseLabel);

  // Tarjeta (compacta)
  let card: string;
  if (recurring.length) {
    const allDows = [...new Set(recurring.map((r) => r.dow))].sort((a, b) => monKey(a) - monKey(b));
    const names = cap(joinY(allDows.map((d) => plural(L.dow[d]))));
    // La hora solo se añade si el horario es único de verdad. Con «viernes 7 y 14, sábados
    // 22 y 29» a las 20:00, la tarjeta decía «Viernes y sábados · 20:00» y volvía a prometer
    // lo que se le acababa de quitar a la frase. Los nombres de los días sí se quedan: son
    // ciertos del periodo entero, y las fechas exactas están a un clic. (Codex, 28/08/2026.)
    card = horasTodas.length === 1 && horasTodas[0] && !corteMudo && unicoHorario(vigentes, hastaDonde) ? `${names} · ${horasTodas[0]}` : names;
  } else if (dias.reduce((n, d) => n + d.pases.length, 0) <= 3) {
    // Aquí sí se enseñan los días de verdad, con el de hoy incluido.
    card = cap(joinY(dias.map((d) => dayMonthFull(d.date))));
  } else {
    card = L.consultar;
  }

  return { card, full, loose, hasPattern: recurring.length > 0, dias, aviso };
}
