<?php
// ============================================================================
//  PANEL DE PANTALLAS · Teatre Muntaner (escaparate / marquesina)
//  - Varias pantallas por teatro, cada una con nombre, resolución y montaje.
//  - Cada pantalla: su horario (qué cartel, qué días, qué horas).
//  - Sube / borra carteles (imágenes y vídeos).
//  - Genera un HTML por pantalla → en Fully Kiosk pones esa URL de inicio.
//  Todo se guarda en config.json, que leen las pantallas (motor.js).
// ============================================================================

define('CLAVE', 'muntaner2026');   // ⬅️  CAMBIA ESTO por tu contraseña

// El panel corre donde haya PHP y escribe en la carpeta /tele (mismo hosting).
$TELE_URL = 'https://tele.teatremuntaner.com/';  // URL pública de /tele (con barra al final)
$TELE_DIR = '';                               // vacío = autodetectar; o ruta absoluta a /tele
if ($TELE_DIR === '') {
  foreach ([__DIR__, __DIR__.'/tele', dirname(__DIR__).'/tele', dirname(dirname(__DIR__)).'/tele'] as $cand) {
    if (is_dir($cand) && (file_exists($cand.'/index.html') || file_exists($cand.'/config.json'))) { $TELE_DIR = $cand; break; }
  }
  if ($TELE_DIR === '') $TELE_DIR = __DIR__;
}

$CONFIG  = $TELE_DIR . '/config.json';
$EXT_IMG = ['png','jpg','jpeg','gif','webp'];
$EXT_VID = ['mp4','webm','mov','m4v'];
$MARCA   = '<!-- pantalla-generada -->';

// Los carteles (imágenes/vídeos) viven en /tele/media (separados de los archivos del programa).
$MEDIA_DIR = $TELE_DIR . '/media';
$MEDIA_URL = $TELE_URL . 'media/';
if (!is_dir($MEDIA_DIR)) @mkdir($MEDIA_DIR, 0775, true);
if (!file_exists($MEDIA_DIR . '/.htaccess')) @file_put_contents($MEDIA_DIR . '/.htaccess', "Require all granted\n");

function clave_ok(){
  $c = $_SERVER['HTTP_X_CLAVE'] ?? ($_POST['pass'] ?? ($_GET['pass'] ?? ''));
  return is_string($c) && hash_equals(CLAVE, $c);
}
function ini_bytes($v){
  $v = trim($v); if ($v === '') return 0;
  $u = strtolower(substr($v,-1)); $n = (int)$v;
  if ($u === 'g') $n *= 1024*1024*1024; elseif ($u === 'm') $n *= 1024*1024; elseif ($u === 'k') $n *= 1024;
  return $n;
}
function limite_subida(){
  $vals = array_filter([ini_bytes(ini_get('upload_max_filesize')), ini_bytes(ini_get('post_max_size'))]);
  return $vals ? min($vals) : 0;
}
function listar_archivos($DIR, $EXT_IMG, $EXT_VID){
  $arch = [];
  foreach (scandir($DIR) as $f){
    if ($f === '.' || $f === '..') continue;
    $p = $DIR.'/'.$f; if (!is_file($p)) continue;
    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
    if (in_array($ext, $EXT_IMG))     $arch[] = ['nombre'=>$f,'tipo'=>'imagen','tam'=>filesize($p)];
    elseif (in_array($ext, $EXT_VID)) $arch[] = ['nombre'=>$f,'tipo'=>'video','tam'=>filesize($p)];
  }
  usort($arch, fn($x,$y)=>strcasecmp($x['nombre'],$y['nombre']));
  return $arch;
}
function slugify($s){
  $s = strtolower(trim($s));
  $s = strtr($s, ['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','à'=>'a','è'=>'e','ï'=>'i','ü'=>'u','ñ'=>'n','ç'=>'c']);
  $s = preg_replace('/[^a-z0-9]+/','-', $s);
  $s = trim($s, '-');
  return $s === '' ? 'pantalla' : $s;
}
// Migra el formato antiguo (una sola pantalla en la raíz) al nuevo (pantallas{}).
function normaliza_config($cfg){
  if (!is_array($cfg)) $cfg = [];
  if (empty($cfg['pantallas']) || !is_array($cfg['pantallas'])) {
    $cfg = ['pantallas' => ['principal' => [
      'nombre'     => 'Pantalla',
      'ancho'      => 1920, 'alto' => 1080,
      'grados'     => isset($cfg['grados']) ? (int)$cfg['grados'] : -90,
      'porDefecto' => $cfg['porDefecto'] ?? null,
      'franjas'    => $cfg['franjas'] ?? [],
    ]]];
  }
  return $cfg;
}
function limpia_lista($lista){
  $out = [];
  if (is_array($lista)) foreach ($lista as $it){
    if (empty($it['archivo'])) continue;
    $e = [
      'archivo'  => basename($it['archivo']),
      'segundos' => max(0, min(3600, (int)($it['segundos'] ?? 0))),
      'girar'    => array_key_exists('girar', $it) ? !empty($it['girar']) : true,
    ];
    if (!empty($it['show'])) $e['show'] = preg_replace('/[^a-z0-9\-]/','', strtolower((string)$it['show']));
    $out[] = $e;
  }
  return $out;
}
function html_pantalla($slug, $nombre, $MARCA){
  $n = htmlspecialchars($nombre, ENT_QUOTES, 'UTF-8');
  $s = htmlspecialchars($slug,   ENT_QUOTES, 'UTF-8');
  return "<!DOCTYPE html>\n$MARCA\n<html lang=\"es\"><head>"
    ."<meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
    ."<meta name=\"robots\" content=\"noindex, nofollow\"><title>$n</title>"
    ."<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}"
    ."#stage{position:fixed;inset:0;overflow:hidden}"
    ."#stage img,#stage video{width:100%;height:100%;object-fit:cover;display:block}</style></head>"
    ."<body><div id=\"stage\"></div>"
    ."<script>window.PANTALLA='$s';</script><script src=\"motor.js?v=19\"></script></body></html>\n";
}

// ─────────────── SSO madteatro (aditivo · back-compat) ───────────────
// El token sso de madteatro caduca en 5 min; al entrar emitimos un "ticket"
// firmado más largo (8 h, mismo secreto) que el front reenvía en cada llamada
// por la cabecera X-Mad-Ticket. Cookie-free a propósito: funciona en el iframe.
function mad_ticket_make($mad){
  $secret = mad_sso_secret(); if ($secret === '' || !$mad) return '';
  $payload = ['t'=>$mad['t']??'', 'caps'=>$mad['caps']??['view'], 'name'=>$mad['name']??'', 'email'=>$mad['email']??'', 'exp'=>time()+8*3600];
  $p = rtrim(strtr(base64_encode((string)json_encode($payload)), '+/', '-_'), '=');
  return $p . '.' . hash_hmac('sha256', $p, $secret);
}
function mad_ticket_read($tok){
  $secret = mad_sso_secret(); if ($secret === '' || $tok === '') return null;
  $parts = explode('.', $tok, 2); if (count($parts) !== 2) return null;
  if (!hash_equals(hash_hmac('sha256', $parts[0], $secret), $parts[1])) return null;
  $c = json_decode((string)base64_decode(strtr($parts[0], '-_', '+/')), true);
  if (!is_array($c) || (int)($c['exp'] ?? 0) < time()) return null;
  return $c;
}
// Permite que madteatro abra el panel en un iframe (si no, el navegador lo bloquea):
header("Content-Security-Policy: frame-ancestors 'self' https://madteatro.com");
// Si madteatro pasa un token firmado válido (?sso=…) o el front reenvía su ticket
// (X-Mad-Ticket), el panel confía en esa identidad y entra SIN contraseña. Sin eso
// (o sin la clave compartida instalada en mad_sso.key) TODO sigue como hoy.
$MAD = null; $MAD_EDIT = false;
if (is_file(__DIR__ . '/mad_sso.php')) {
  // La clave puede estar fuera del docroot (../private), en un private/ junto al
  // panel, o al lado del panel. Cogemos la primera que exista (todas deben llevar
  // su .htaccess "Require all denied"). Así no depende de la ruta exacta de subida.
  if (!defined('MAD_SSO_SECRET')) {
    foreach ([__DIR__.'/../private/mad_sso.key', __DIR__.'/private/mad_sso.key', __DIR__.'/mad_sso.key'] as $kf) {
      if (is_file($kf)) { define('MAD_SSO_SECRET', trim((string)file_get_contents($kf))); break; }
    }
  }
  require_once __DIR__ . '/mad_sso.php';
  $MAD = mad_ticket_read((string)($_SERVER['HTTP_X_MAD_TICKET'] ?? ''));
  if (!$MAD) {
    $sso = mad_sso_claims();
    if ($sso) $MAD = ['t'=>$sso['theater']??'', 'caps'=>$sso['caps']??['view'], 'name'=>$sso['name']??'', 'email'=>$sso['email']??''];
  }
  $MAD_EDIT = $MAD && in_array('edit', (array)($MAD['caps'] ?? []), true);
}

$action = $_GET['action'] ?? '';

// ──────────────────────────── API (JSON) ───────────────────────────────────
if ($action !== '') {
  header('Content-Type: application/json; charset=utf-8');
  $pwd_ok = clave_ok();
  if (!$pwd_ok && !$MAD) { http_response_code(401); echo json_encode(['ok'=>false,'msg'=>'Contraseña incorrecta.']); exit; }
  $puede_editar = $pwd_ok || $MAD_EDIT;   // SSO sin cap 'edit' => solo lectura
  if (in_array($action, ['guardar','subir','borrar'], true) && !$puede_editar) {
    http_response_code(403); echo json_encode(['ok'=>false,'msg'=>'Sesión de solo lectura (madteatro).']); exit;
  }

  if ($action === 'estado') {
    $cfg = file_exists($CONFIG) ? json_decode(file_get_contents($CONFIG), true) : null;
    $cfg = normaliza_config($cfg);
    echo json_encode([
      'ok'        => true,
      'config'    => $cfg,
      'archivos'  => listar_archivos($MEDIA_DIR, $EXT_IMG, $EXT_VID),
      'limite'    => limite_subida(),
      'baseUrl'   => $MEDIA_URL,
      'teleUrl'   => $TELE_URL,
      'escribible'=> is_writable($TELE_DIR) && is_dir($MEDIA_DIR) && is_writable($MEDIA_DIR) && (!file_exists($CONFIG) || is_writable($CONFIG)),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }

  if ($action === 'guardar' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body) || !isset($body['config']['pantallas']) || !is_array($body['config']['pantallas'])) {
      http_response_code(400); echo json_encode(['ok'=>false,'msg'=>'Datos inválidos.']); exit;
    }
    $limpio = ['pantallas' => []];
    foreach ($body['config']['pantallas'] as $slug => $p) {
      $slug = slugify($slug); if ($slug === '') continue;
      $franjas = [];
      foreach (($p['franjas'] ?? []) as $f) {
        if (empty($f['archivo']) || empty($f['desde']) || empty($f['hasta'])) continue;
        $base = [
          'nombre'=>mb_substr(trim((string)($f['nombre'] ?? '')), 0, 60),
          'desde'=>preg_replace('/[^0-9:]/','',$f['desde']),
          'hasta'=>preg_replace('/[^0-9:]/','',$f['hasta']),
          'archivo'=>basename($f['archivo']),
          'girar'=>!empty($f['girar']),
        ];
        if (!empty($f['show'])) $base['show'] = preg_replace('/[^a-z0-9\-]/','', strtolower((string)$f['show']));
        if (($f['tipo'] ?? '') === 'fecha') {
          $d1 = (string)($f['desdeFecha'] ?? '');
          $d2 = (string)($f['hastaFecha'] ?? '');
          if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d1)) continue;
          if ($d2 !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d2)) $d2 = '';
          $franjas[] = array_merge(['tipo'=>'fecha','desdeFecha'=>$d1,'hastaFecha'=>$d2], $base);
        } else {
          $dias = array_values(array_filter(array_map('intval', $f['dias'] ?? []), fn($d)=>$d>=0 && $d<=6));
          if (!$dias) continue;
          $franjas[] = array_merge(['tipo'=>'semanal','dias'=>$dias], $base);
        }
      }
      $def = null;
      $pd = $p['porDefecto'] ?? null;
      if (is_array($pd)) {
        if (!empty($pd['lista'])) {
          $lista = limpia_lista($pd['lista']);
          if ($lista) $def = ['lista'=>$lista, 'girar'=>!empty($pd['girar'])];
        } elseif (!empty($pd['url']) && preg_match('#^https?://#i', (string)$pd['url'])) {
          $def = ['url'=>mb_substr(trim((string)$pd['url']),0,500), 'girar'=>!empty($pd['girar'])];
        } elseif (!empty($pd['archivo'])) {
          $def = ['archivo'=>basename($pd['archivo']), 'girar'=>!empty($pd['girar'])];
        }
      }
      $progs = [];
      foreach (($p['programados'] ?? []) as $pr) {
        $desde = (string)($pr['desde'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde)) continue;
        $e = ['desde'=>$desde, 'girar'=>!empty($pr['girar'])];
        if (!empty($pr['lista'])) { $l = limpia_lista($pr['lista']); if ($l) $e['lista'] = $l; }
        elseif (!empty($pr['url']) && preg_match('#^https?://#i', (string)$pr['url'])) { $e['url'] = mb_substr(trim((string)$pr['url']),0,500); }
        elseif (!empty($pr['archivo'])) { $e['archivo'] = basename($pr['archivo']); }
        $progs[] = $e;
      }
      $limpio['pantallas'][$slug] = [
        'nombre' => trim((string)($p['nombre'] ?? 'Pantalla')) ?: 'Pantalla',
        'ancho'  => max(1, (int)($p['ancho'] ?? 1920)),
        'alto'   => max(1, (int)($p['alto']  ?? 1080)),
        'grados' => (int)($p['grados'] ?? -90),
        'porDefecto' => $def,
        'programados'=> $progs,
        'franjas'    => $franjas,
      ];
    }
    if (!$limpio['pantallas']) { http_response_code(400); echo json_encode(['ok'=>false,'msg'=>'Hace falta al menos una pantalla.']); exit; }

    // Conserva los campos de nivel superior (overlay "próxima función") que el panel
    // no edita: el motor y el generador diario dependen de ellos. Sin esto, cualquier
    // "Guardar" desde el panel los borraría y el overlay dejaría de salir.
    $prev = file_exists($CONFIG) ? json_decode(file_get_contents($CONFIG), true) : null;
    if (is_array($prev)) {
      if (!empty($prev['funcionesUrl'])) $limpio['funcionesUrl'] = $prev['funcionesUrl'];
      if (!empty($prev['overlay']))      $limpio['overlay']      = $prev['overlay'];
    }

    file_put_contents($CONFIG, json_encode($limpio, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT), LOCK_EX);

    // Generar un HTML por pantalla (salvo 'principal', que usa index.html) y limpiar huérfanos.
    $slugs = array_keys($limpio['pantallas']);
    foreach ($limpio['pantallas'] as $slug => $p) {
      if ($slug === 'principal') continue;
      @file_put_contents($TELE_DIR.'/'.$slug.'.html', html_pantalla($slug, $p['nombre'], $MARCA), LOCK_EX);
    }
    foreach (scandir($TELE_DIR) as $f) {
      if (!preg_match('/\.html$/i', $f) || strcasecmp($f,'index.html')===0) continue;
      $ruta = $TELE_DIR.'/'.$f;
      if (!is_file($ruta)) continue;
      $cab = @file_get_contents($ruta, false, null, 0, 80);
      if ($cab !== false && strpos($cab, 'pantalla-generada') !== false) {
        $slugArch = preg_replace('/\.html$/i','',$f);
        if (!in_array($slugArch, $slugs, true)) @unlink($ruta);
      }
    }
    echo json_encode(['ok'=>true]); exit;
  }

  if ($action === 'subir' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (empty($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
      $err = $_FILES['archivo']['error'] ?? -1;
      $msg = ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE)
           ? 'El archivo supera el límite del servidor. Súbelo por FTP a /tele/ y aparecerá igualmente.'
           : 'No se recibió el archivo.';
      http_response_code(400); echo json_encode(['ok'=>false,'msg'=>$msg]); exit;
    }
    $f = $_FILES['archivo'];
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, array_merge($EXT_IMG, $EXT_VID))) {
      http_response_code(400); echo json_encode(['ok'=>false,'msg'=>'Tipo no permitido. Usa imágenes (png, jpg…) o vídeos (mp4, webm…).']); exit;
    }
    $name = preg_replace('/[^A-Za-z0-9._ \-]/','_', $f['name']);
    $base = pathinfo($name, PATHINFO_FILENAME);
    $dst  = $MEDIA_DIR.'/'.$name; $n = 1;
    while (file_exists($dst)) { $dst = $MEDIA_DIR.'/'.$base." ($n).".$ext; $n++; }
    if (!move_uploaded_file($f['tmp_name'], $dst)) {
      http_response_code(500); echo json_encode(['ok'=>false,'msg'=>'No se pudo guardar.']); exit;
    }
    echo json_encode(['ok'=>true,'nombre'=>basename($dst)]); exit;
  }

  if ($action === 'borrar' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $n = basename($body['nombre'] ?? '');
    $ext = strtolower(pathinfo($n, PATHINFO_EXTENSION));
    if ($n === '' || !in_array($ext, array_merge($EXT_IMG, $EXT_VID))) {
      http_response_code(400); echo json_encode(['ok'=>false,'msg'=>'Archivo inválido.']); exit;
    }
    $p = $MEDIA_DIR.'/'.$n;
    if (is_file($p)) @unlink($p);
    echo json_encode(['ok'=>true]); exit;
  }

  http_response_code(400); echo json_encode(['ok'=>false,'msg'=>'Acción desconocida.']); exit;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Panel de pantallas · Teatre Muntaner</title>
<style>
  /* Modo claro · colores corporativos Teatre Muntaner (burdeos + oro) */
  :root{ --bg:#f6f3ee; --panel:#ffffff; --panel2:#faf7f1; --line:#e4ddd0; --txt:#14100e; --dim:#6f675f;
         --acc:#bd221f; --acc2:#8e1a18; --ok:#2f9e5b; --bad:#d33b3b; --radius:14px;
         --c-burdeos:#bd221f; --c-oro:#d5a846; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--txt);line-height:1.45;padding-bottom:90px}
  h1{font-size:1.15rem;font-weight:600}
  h2{font-size:.95rem;font-weight:600;color:var(--acc2);margin-bottom:10px}
  .wrap{max-width:780px;margin:0 auto;padding:16px}
  header{display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
  .logo-img{height:38px;width:auto;display:block}
  .brandbar{height:4px;background:linear-gradient(90deg,var(--c-burdeos) 0 50%,var(--c-oro) 50% 100%)}
  header small{color:var(--dim);display:block;font-size:.72rem}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px;margin-bottom:18px}
  .btn{appearance:none;border:1px solid var(--line);background:var(--panel2);color:var(--txt);padding:10px 14px;border-radius:10px;font-size:.9rem;cursor:pointer;font-weight:500}
  .btn:hover{border-color:var(--acc)}
  .btn.primary{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:600}
  .btn.ghost{background:transparent}
  .btn.danger{color:var(--bad);border-color:#5a2c2c}
  .btn.sm{padding:6px 10px;font-size:.8rem;border-radius:8px}
  input,select{font:inherit;color:var(--txt);background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:9px 10px}
  input[type=time]{min-width:108px}
  input[type=number]{width:92px}
  label{font-size:.85rem;color:var(--dim)}
  .dim{color:var(--dim)} .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .field{display:flex;flex-direction:column;gap:5px}

  #login{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:50}
  #login .box{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:28px;width:min(360px,90vw);text-align:center}
  #login input{width:100%;margin:16px 0;text-align:center;font-size:1.05rem}

  .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
  .tab{padding:8px 14px;border:1px solid var(--line);border-radius:999px;background:var(--panel2);color:var(--dim);cursor:pointer;font-size:.86rem}
  .tab.on{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:600}
  .tab.add{border-style:dashed;color:var(--acc2)}
  .url{font-size:.78rem;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px 10px;color:var(--acc2);word-break:break-all;user-select:all}

  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:12px}
  .media{background:var(--panel2);border:1px solid var(--line);border-radius:11px;overflow:hidden;position:relative}
  .media .thumb{height:84px;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .media .thumb img,.media .thumb video{width:100%;height:100%;object-fit:cover}
  .media .meta{padding:7px 8px;font-size:.72rem;word-break:break-all}
  .media .meta .tam{color:var(--dim);font-size:.66rem}
  .media .del{position:absolute;top:5px;right:5px;background:rgba(0,0,0,.6);border:none;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:.85rem}
  .badge{position:absolute;top:5px;left:5px;background:rgba(0,0,0,.6);border-radius:6px;font-size:.62rem;padding:2px 5px}
  .upload-tile{border:1.5px dashed var(--line);border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;color:var(--dim);min-height:120px;font-size:.8rem;text-align:center;padding:8px}
  .upload-tile:hover{border-color:var(--acc);color:var(--acc2)}

  .franja{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
  .franja .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  .dias{display:flex;gap:6px;flex-wrap:wrap}
  .dia{width:34px;height:34px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--dim);cursor:pointer;font-size:.82rem;font-weight:600}
  .dia.on{background:var(--acc);border-color:var(--acc);color:#fff}
  .seg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
  .chk{display:flex;align-items:center;gap:7px;cursor:pointer;font-size:.85rem;color:var(--txt)}
  .chk input{width:18px;height:18px}
  .mini{width:30px;height:42px;border-radius:5px;object-fit:cover;background:#000;border:1px solid var(--line)}
  .franja .head{gap:8px}
  .nombref{flex:1;min-width:120px;font-weight:600;font-size:.92rem;background:transparent;border:1px solid transparent;color:var(--txt);border-radius:7px;padding:7px 9px}
  .nombref:hover,.nombref:focus{border-color:var(--line);background:var(--panel)}
  .dropcartel{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1.5px dashed var(--line);border-radius:9px;min-height:46px}
  .dropcartel.drag{border-color:var(--acc);background:rgba(200,155,60,.10)}
  .dropcartel img{width:28px;height:40px;object-fit:cover;border-radius:5px;background:#000;border:1px solid var(--line)}
  .dropcartel .ico{font-size:1.3rem}
  .dropcartel .nom{font-size:.82rem;word-break:break-all}
  .media{cursor:grab}
  .media.sinuso{box-shadow:0 0 0 2px var(--bad) inset;border-color:var(--bad)}
  .media .nouso{position:absolute;top:5px;right:33px;background:var(--bad);color:#fff;font-size:.58rem;font-weight:700;padding:2px 6px;border-radius:999px}
  .grid.drag{outline:2px dashed var(--acc);outline-offset:3px;border-radius:11px}
  .plitem{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:7px 9px;margin-bottom:7px}
  .plitem img{width:26px;height:38px;object-fit:cover;border-radius:4px;background:#000;border:1px solid var(--line)}
  .plitem .ico{font-size:1.1rem;width:26px;text-align:center}
  .plitem .nm{flex:1;font-size:.8rem;word-break:break-all}
  .plitem input[type=number]{width:64px}
  .plitem .ctrl{display:flex;gap:4px}
  .showsel{max-width:150px;font-size:.72rem;padding:5px 6px}
  .pl-add{border:1.5px dashed var(--line);border-radius:9px;padding:10px;text-align:center;color:var(--dim);margin-top:6px;font-size:.82rem}
  .pl-add.drag{border-color:var(--acc);background:rgba(200,155,60,.10)}
  .pl-add select{max-width:160px}
  .dgrupo{border:1px solid var(--line);border-radius:11px;padding:12px;margin-bottom:10px;background:var(--panel2)}
  .dgrupo.prog{border-color:#e7cf8f}
  #tv .capa{position:absolute;inset:0;opacity:0;transition:opacity .5s ease}
  .thumb,.plitem img,.plitem .ico{cursor:zoom-in}
  #lightbox{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none;align-items:center;justify-content:center;z-index:60;padding:20px}
  #lightbox.show{display:flex}
  #lightbox img,#lightbox video{max-width:92vw;max-height:88vh;border-radius:10px;box-shadow:0 10px 50px rgba(0,0,0,.7);background:#000}
  #lightbox .cerrar{position:absolute;top:16px;right:20px;background:rgba(0,0,0,.5);border:1px solid var(--line);color:#fff;width:40px;height:40px;border-radius:50%;font-size:1.1rem;cursor:pointer}

  .preview-wrap{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
  .tvbox{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:180px;height:300px}
  .tv{border:6px solid #000;border-radius:12px;background:#000;overflow:hidden;position:relative;box-shadow:0 6px 24px rgba(0,0,0,.5)}
  .tv .vacio{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#555;font-size:.78rem;text-align:center;padding:10px}

  .savebar{position:fixed;left:0;right:0;bottom:0;background:var(--panel);border-top:1px solid var(--line);padding:12px 16px;display:flex;gap:12px;align-items:center;justify-content:flex-end;z-index:8}
  .savebar .estado{margin-right:auto;font-size:.85rem;color:var(--dim)}
  .toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#000;color:#fff;padding:10px 18px;border-radius:30px;font-size:.88rem;opacity:0;transition:opacity .25s;pointer-events:none;z-index:20;border:1px solid var(--line)}
  .toast.show{opacity:1}
</style>
</head>
<body>

<div id="login">
  <div class="box">
    <img src="logo-muntaner.png" alt="Teatre Muntaner" style="height:64px;width:auto;margin:0 auto">
    <div class="dim" style="font-size:.86rem;margin-top:8px">Pantallas del escaparate</div>
    <input id="pass" type="password" placeholder="Contraseña" autocomplete="current-password">
    <button class="btn primary" style="width:100%" onclick="entrar()">Entrar</button>
    <div id="loginErr" style="color:var(--bad);font-size:.82rem;margin-top:10px;min-height:1em"></div>
  </div>
</div>

<div id="app" style="display:none">
  <header>
    <img class="logo-img" src="logo-muntaner.png" alt="Teatre Muntaner">
    <h1 style="font-size:1rem;font-weight:600">Pantallas del escaparate</h1>
    <button class="btn ghost sm" style="margin-left:auto" onclick="salir()">Salir</button>
  </header>
  <div class="brandbar"></div>

  <div class="wrap">

    <!-- PANTALLAS -->
    <div class="card">
      <h2>Pantallas</h2>
      <div class="tabs" id="tabs"></div>
      <div id="ajustesPantalla"></div>
    </div>

    <!-- VISTA PREVIA -->
    <div class="card">
      <h2>Vista previa</h2>
      <div class="preview-wrap">
        <div class="tvbox"><div class="tv" id="tv"><div class="vacio">—</div></div></div>
        <div>
          <p class="dim" style="font-size:.85rem;margin-bottom:10px">Tal cual lo verá la gente desde la calle, con el tamaño real de esta pantalla.</p>
          <div class="field" style="max-width:250px">
            <label>Simular fecha y hora</label>
            <div class="row"><input id="simFecha" type="date"><input id="simHora" type="time" value="22:30"></div>
            <button class="btn sm ghost" style="margin-top:8px" onclick="simAhora()">↻ Ver ahora mismo</button>
          </div>
          <p id="simInfo" class="dim" style="font-size:.8rem;margin-top:10px"></p>
        </div>
      </div>
    </div>

    <!-- CARTELES -->
    <div class="card">
      <h2>Carteles (imágenes y vídeos)</h2>
      <p class="dim" style="font-size:.82rem;margin-bottom:10px">Compartidos por todas las pantallas. Súbelos <strong>derechos</strong>: cada pantalla los gira según cómo esté montada.</p>
      <div class="grid" id="carteles"></div>
      <p class="dim" style="font-size:.78rem;margin-top:12px" id="limiteInfo"></p>
      <input id="fileInput" type="file" accept="image/*,video/*" style="display:none" onchange="subir(this.files[0])">
    </div>

    <!-- HORARIO -->
    <div class="card">
      <h2>Horario de <span id="nombreHorario" style="color:var(--txt)"></span></h2>
      <p class="dim" style="font-size:.84rem;margin-bottom:14px">Los <strong>eventos</strong> (día concreto) mandan sobre las franjas semanales. Dentro de cada grupo gana la primera que coincida. Si ninguna coincide, se ve el cartel "por defecto".</p>
      <div id="franjas"></div>
      <div class="row">
        <button class="btn" onclick="addFranja('semanal')">＋ Franja semanal</button>
        <button class="btn" onclick="addFranja('fecha')">📅 Evento (día concreto)</button>
      </div>
      <div style="margin-top:22px;border-top:1px solid var(--line);padding-top:16px">
        <h2 style="font-size:.88rem">El resto del tiempo (por defecto)</h2>
        <div id="porDefecto"></div>
      </div>
    </div>

  </div>

  <div class="savebar">
    <span class="estado" id="estadoGuardado"></span>
    <button class="btn ghost" onclick="cargar()">Descartar cambios</button>
    <button class="btn primary" onclick="guardar()">Guardar cambios</button>
  </div>
</div>

<div class="toast" id="toast"></div>
<div id="lightbox" onclick="cerrarLightbox()"><button class="cerrar" onclick="cerrarLightbox()">✕</button><div id="lbContent" onclick="event.stopPropagation()"></div></div>

<?php if ($MAD): ?>
<script>window.MAD_SSO = {name: <?= json_encode($MAD['name'] ?? '', JSON_UNESCAPED_UNICODE) ?>, theater: <?= json_encode($MAD['t'] ?? '') ?>, edit: <?= $MAD_EDIT ? 'true' : 'false' ?>, ticket: <?= json_encode(mad_ticket_make($MAD)) ?>};</script>
<?php endif; ?>
<script>
// ════════════════════ Estado ════════════════════
var CLAVE='', BASE='', URL_TELE='', limite=0;
var archivos=[];
var config={pantallas:{}};
var sel='';                       // slug de la pantalla seleccionada
var previewTimer=null, previewGen=0;
var shows=[];   // lista de espectáculos de funciones.json (para el selector de "próxima función")
function cargarShows(){
  var u = config && config.funcionesUrl; if(!u){ shows=[]; return; }
  fetch(u+(u.indexOf('?')<0?'?':'&')+'t='+Date.now()).then(function(r){ return r.json(); })
    .then(function(j){ shows=((j&&j.shows)||[]).map(function(s){ return {id:s.id, title:s.title}; }); render(); })
    .catch(function(){ shows=[]; });
}
function opcionesShow(sel){
  var out='<option value="">(automático por nombre)</option>';
  shows.forEach(function(s){ out+='<option value="'+s.id+'"'+(s.id===sel?' selected':'')+'>'+(s.title||s.id)+'</option>'; });
  return out;
}
function slotItemShow(t,i,v){ var it=dObj(t).lista[i]; if(v) it.show=v; else delete it.show; cambiado(); preview(); }
var duraciones={};   // cache de la duración (s) de cada vídeo
function fmtDur(s){ if(!isFinite(s)||s<=0) return ''; var m=Math.floor(s/60), sec=Math.round(s%60); return (m?m+'m ':'')+sec+'s'; }
function pedirDuracion(archivo,cb){
  if(duraciones[archivo]!=null){ cb(duraciones[archivo]); return; }
  var v=document.createElement('video'); v.preload='metadata'; v.muted=true; v.src=urlDe(archivo);
  v.onloadedmetadata=function(){ duraciones[archivo]=v.duration||0; cb(duraciones[archivo]); };
  v.onerror=function(){ duraciones[archivo]=0; cb(0); };
}
var DIAS=[['L',1],['M',2],['X',3],['J',4],['V',5],['S',6],['D',0]];
var NOMBRE_DIA={0:'Domingo',1:'Lunes',2:'Martes',3:'Miércoles',4:'Jueves',5:'Viernes',6:'Sábado'};
var MONTAJE=[['Normal (horizontal)',0],['Girada 90° a la derecha',-90],['Girada 90° a la izquierda',90],['Del revés (180°)',180]];

// ════════════════════ Login ════════════════════
function entrar(){
  CLAVE=document.getElementById('pass').value;
  document.getElementById('loginErr').textContent='';
  api('estado').then(function(d){
    aplicarEstado(d);
    document.getElementById('login').style.display='none';
    document.getElementById('app').style.display='block';
    sessionStorage.setItem('clavePanel',CLAVE);
  }).catch(function(e){ document.getElementById('loginErr').textContent=e.msg||'No se pudo entrar.'; });
}
function salir(){ sessionStorage.removeItem('clavePanel'); location.reload(); }
document.getElementById('pass').addEventListener('keydown',function(e){ if(e.key==='Enter') entrar(); });

// ════════════════════ API ════════════════════
function api(action,opts){
  opts=opts||{};
  var o={method:opts.method||'GET',headers:{'X-Clave':CLAVE}};
  if(window.MAD_SSO&&MAD_SSO.ticket) o.headers['X-Mad-Ticket']=MAD_SSO.ticket;   // sesión confiada por madteatro
  if(opts.json){ o.headers['Content-Type']='application/json'; o.body=JSON.stringify(opts.json); }
  if(opts.form){ o.body=opts.form; }
  return fetch('panel.php?action='+action,o).then(function(r){
    return r.json().then(function(j){ if(!r.ok||!j.ok){ throw j; } return j; });
  });
}
function aplicarEstado(d){
  archivos=d.archivos||[]; limite=d.limite||0; BASE=d.baseUrl||''; URL_TELE=d.teleUrl||BASE.replace(/media\/$/,'');
  config=d.config&&d.config.pantallas?d.config:{pantallas:{}};
  var claves=Object.keys(config.pantallas);
  if(claves.indexOf(sel)<0) sel=claves[0]||'';
  render();
  if(!shows.length) cargarShows();
  if(d.escribible===false) setTimeout(function(){ toast('Aviso: el panel no puede escribir en /tele. Revisa la ruta o permisos.',true); },600);
}
function cargar(){ api('estado').then(aplicarEstado).then(function(){ marcar('Sin cambios'); }); }
function P(){ return config.pantallas[sel]; }

// ════════════════════ Helpers ════════════════════
function fmtTam(b){ if(b>1048576) return (b/1048576).toFixed(1)+' MB'; if(b>1024) return Math.round(b/1024)+' KB'; return b+' B'; }
function esVideo(n){ return /\.(mp4|webm|mov|m4v)$/i.test(n); }
function urlDe(n){ return BASE+n; }
function thumbHTML(n){ return esVideo(n) ? '<video src="'+urlDe(n)+'" muted></video>' : '<img src="'+urlDe(n)+'" alt="">'; }
function slugify(s){ s=(s||'').toLowerCase().trim();
  s=s.replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n').replace(/ç/g,'c');
  s=s.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); return s||'pantalla'; }

// ════════════════════ Render ════════════════════
function render(){
  renderTabs(); renderAjustes(); renderCarteles();
  document.getElementById('nombreHorario').textContent = P()?('"'+P().nombre+'"'):'';
  renderFranjas(); renderPorDefecto(); ponerFechaHoy(); preview();
  document.getElementById('limiteInfo').textContent = limite ? ('Límite de subida del servidor: ~'+fmtTam(limite)+'. Si un vídeo es mayor, súbelo por FTP a /tele/ y aparecerá aquí igual.') : '';
}
function renderTabs(){
  var t=document.getElementById('tabs'); t.innerHTML='';
  Object.keys(config.pantallas).forEach(function(slug){
    var b=document.createElement('button'); b.className='tab'+(slug===sel?' on':''); b.textContent=config.pantallas[slug].nombre;
    b.onclick=function(){ sel=slug; render(); }; t.appendChild(b);
  });
  var add=document.createElement('button'); add.className='tab add'; add.textContent='＋ Nueva pantalla'; add.onclick=nuevaPantalla; t.appendChild(add);
}
function renderAjustes(){
  var c=document.getElementById('ajustesPantalla'); if(!P()){ c.innerHTML=''; return; }
  var p=P();
  var mont=MONTAJE.map(function(m){ return '<option value="'+m[1]+'"'+(m[1]===(p.grados==null?-90:p.grados)?' selected':'')+'>'+m[0]+'</option>'; }).join('');
  var puedeBorrar = sel!=='principal';
  var url = URL_TELE + (sel==='principal' ? '' : sel+'.html');
  c.innerHTML=
    '<div class="seg">'+
      '<div class="field" style="flex:1;min-width:180px"><label>Nombre de la pantalla</label><input type="text" value="'+(p.nombre||'').replace(/"/g,'&quot;')+'" onchange="setP(\'nombre\',this.value)"></div>'+
      '<div class="field"><label>¿Cómo está montada?</label><select onchange="setP(\'grados\',parseInt(this.value,10))">'+mont+'</select></div>'+
    '</div>'+
    '<div class="seg">'+
      '<div class="field"><label>Resolución (ancho × alto, px)</label><div class="row"><input type="number" value="'+p.ancho+'" onchange="setP(\'ancho\',parseInt(this.value,10))"> × <input type="number" value="'+p.alto+'" onchange="setP(\'alto\',parseInt(this.value,10))"></div></div>'+
    '</div>'+
    '<div class="field" style="margin-top:12px"><label>Dirección para Fully Kiosk (pon esto como página de inicio en este dispositivo)</label><div class="url">'+url+'</div></div>'+
    (puedeBorrar ? '<div style="margin-top:12px"><button class="btn danger sm" onclick="borrarPantalla()">🗑 Eliminar esta pantalla</button></div>' : '<p class="dim" style="font-size:.76rem;margin-top:10px">Esta es la pantalla principal (la del archivo index.html); no se puede eliminar.</p>');
}
function marcarUso(u,slot){ if(!slot) return; if(slot.archivo) u[slot.archivo]=1; if(slot.lista) slot.lista.forEach(function(it){ if(it.archivo) u[it.archivo]=1; }); }
function cartelesUsados(){ var u={}; Object.keys(config.pantallas).forEach(function(slug){ var p=config.pantallas[slug];
  (p.franjas||[]).forEach(function(f){ marcarUso(u,f); });
  marcarUso(u,p.porDefecto);
  (p.programados||[]).forEach(function(pr){ marcarUso(u,pr); });
}); return u; }
function renderCarteles(){
  var c=document.getElementById('carteles'); c.innerHTML='';
  c.ondragover=function(e){ e.preventDefault(); c.classList.add('drag'); };
  c.ondragleave=function(){ c.classList.remove('drag'); };
  c.ondrop=function(e){ e.preventDefault(); c.classList.remove('drag'); if(e.dataTransfer.files&&e.dataTransfer.files.length){ uploadCb=null; subir(e.dataTransfer.files[0]); } };
  var usados=cartelesUsados();
  archivos.forEach(function(a){
    var usado=!!usados[a.nombre];
    var d=document.createElement('div'); d.className='media'+(usado?'':' sinuso');
    d.draggable=true; d.ondragstart=function(e){ arrastrarCartel(e,a.nombre); };
    d.innerHTML='<div class="thumb" onclick="abrirLightbox(\''+a.nombre.replace(/'/g,"\\'")+'\')">'+thumbHTML(a.nombre)+'</div>'+
      '<span class="badge">'+(a.tipo==='video'?'🎬 vídeo':'🖼️ imagen')+'</span>'+
      (usado?'':'<span class="nouso">sin usar</span>')+
      '<button class="del" title="Borrar" onclick="borrar(\''+a.nombre.replace(/'/g,"\\'")+'\')">✕</button>'+
      '<div class="meta">'+a.nombre+'<div class="tam">'+fmtTam(a.tam)+'</div></div>';
    c.appendChild(d);
  });
  var up=document.createElement('div'); up.className='upload-tile'; up.onclick=function(){ uploadCb=null; document.getElementById('fileInput').click(); };
  up.innerHTML='<div style="font-size:1.6rem">＋</div><div>Subir o arrastrar</div>'; c.appendChild(up);
}
function opcionesArchivo(s){
  var out='<option value="">— elige un cartel —</option>';
  archivos.forEach(function(a){ out+='<option value="'+a.nombre+'"'+(a.nombre===s?' selected':'')+'>'+a.nombre+'</option>'; });
  return out;
}
function renderFranjas(){
  var cont=document.getElementById('franjas'); cont.innerHTML=''; if(!P()) return;
  var _grd=(P().grados!=null)?P().grados:-90; var rota=(_grd!==0);   // pantalla apaisada (0º) -> el "girar" no aplica
  (P().franjas||[]).forEach(function(f,idx){
    var fecha=(f.tipo==='fecha');
    var el=document.createElement('div'); el.className='franja';
    if(fecha) el.style.borderColor='#e7cf8f';
    var selTipo=
      '<div class="seg" style="margin-top:0">'+
        '<label class="dim" style="margin-right:2px">¿Cuándo?</label>'+
        '<button class="btn sm '+(!fecha?'primary':'ghost')+'" onclick="setTipo('+idx+',\'semanal\')">Cada semana</button>'+
        '<button class="btn sm '+(fecha?'primary':'ghost')+'" onclick="setTipo('+idx+',\'fecha\')">Día / fechas</button>'+
      '</div>';
    var cuando;
    if(fecha){
      cuando=
        '<div class="seg">'+
          '<div class="field"><label>Día</label><input type="date" value="'+(f.desdeFecha||'')+'" onchange="setF('+idx+',\'desdeFecha\',this.value)"></div>'+
          '<div class="field"><label>Hasta (opcional)</label><input type="date" value="'+(f.hastaFecha||'')+'" onchange="setF('+idx+',\'hastaFecha\',this.value)"></div>'+
        '</div>';
    } else {
      var dias=DIAS.map(function(pp){ var on=(f.dias||[]).indexOf(pp[1])>=0; return '<button class="dia'+(on?' on':'')+'" onclick="toggleDia('+idx+','+pp[1]+')">'+pp[0]+'</button>'; }).join('');
      cuando='<div class="field"><label>Días</label><div class="dias">'+dias+'</div></div>';
    }
    var ico=fecha?'📅':'🗓️';
    var ph=fecha?'Nombre del evento (p. ej. Estreno Clap)':'Nombre de la franja (opcional)';
    var head='<div class="head"><span style="font-size:1.05rem">'+ico+'</span>'+
      '<input class="nombref" type="text" value="'+(f.nombre||'').replace(/"/g,'&quot;')+'" placeholder="'+ph+'" onchange="setF('+idx+',\'nombre\',this.value)">'+
      '<button class="btn ghost sm" title="Duplicar" onclick="dupFranja('+idx+')">⧉</button>'+
      '<button class="btn danger sm" title="Quitar" onclick="delFranja('+idx+')">🗑</button></div>';
    var cur=f.archivo;
    var pnf = cur ? cur.replace(/'/g,"\\'") : '';
    var prev = cur ? ((esVideo(cur)?'<span class="ico" onclick="abrirLightbox(\''+pnf+'\')">🎬</span>':'<img src="'+urlDe(cur)+'" onclick="abrirLightbox(\''+pnf+'\')">')+'<span class="nom">'+cur+'</span>')
                   : '<span class="dim">Arrastra aquí un cartel o un archivo de tu ordenador…</span>';
    var cartel='<div class="field"><label>Cartel</label>'+
        '<div class="dropcartel" ondragover="permitir(event);this.classList.add(\'drag\')" ondragleave="this.classList.remove(\'drag\')" ondrop="soltarEnFranja(event,'+idx+')">'+prev+'</div>'+
      '</div>'+
      '<div class="seg">'+
        '<div class="field" style="flex:1;min-width:150px"><label>O elígelo de la lista</label><select onchange="setF('+idx+',\'archivo\',this.value)">'+opcionesArchivo(cur)+'</select></div>'+
        '<button class="btn sm" onclick="pedirArchivoFranja('+idx+')">⬆ Subir nuevo</button>'+
      '</div>'+
      '<div class="seg"><div class="field" style="flex:1;min-width:160px"><label>Espectáculo (para mostrar su "próxima función")</label><select onchange="setF('+idx+',\'show\',this.value)">'+opcionesShow(f.show)+'</select></div></div>';
    el.innerHTML=
      head+selTipo+cuando+
      '<div class="seg">'+
        '<div class="field"><label>Desde</label><input type="time" value="'+(f.desde||'22:00')+'" onchange="setF('+idx+',\'desde\',this.value)"></div>'+
        '<div class="field"><label>Hasta</label><input type="time" value="'+(f.hasta||'03:00')+'" onchange="setF('+idx+',\'hasta\',this.value)"></div>'+
      '</div>'+
      cartel+
      (rota ? '<div class="seg"><label class="chk"><input type="checkbox" '+(f.girar!==false?'checked':'')+' onchange="setF('+idx+',\'girar\',this.checked)"> Girar para la pantalla (déjalo marcado si el cartel está derecho)</label></div>' : '');
    cont.appendChild(el);
  });
}
function renderContenido(t){
  var d=dObj(t); var pl=!!d.lista; var web=(typeof d.url==='string');
  var _pp=P(); var _grd=(_pp&&_pp.grados!=null)?_pp.grados:-90; var rota=(_grd!==0);   // pantalla apaisada (0º) -> el "girar" no aplica
  var toggle='<div class="seg" style="margin-top:0"><label class="dim" style="margin-right:2px">Modo</label>'+
    '<button class="btn sm '+((!pl&&!web)?'primary':'ghost')+'" onclick="slotModo(\''+t+'\',\'single\')">Un cartel</button>'+
    '<button class="btn sm '+(pl?'primary':'ghost')+'" onclick="slotModo(\''+t+'\',\'playlist\')">Playlist (bucle)</button>'+
    '<button class="btn sm '+(web?'primary':'ghost')+'" onclick="slotModo(\''+t+'\',\'web\')">Web (URL)</button></div>';
  var cuerpo;
  if(web){
    cuerpo='<div class="seg"><div class="field" style="flex:1;min-width:240px"><label>Dirección web (URL)</label>'+
      '<input type="text" placeholder="https://…" value="'+(d.url||'').replace(/"/g,'&quot;')+'" oninput="slotUrl(\''+t+'\',this.value)"></div></div>'+
      '<p class="dim" style="font-size:.76rem;margin:6px 0">Incrusta esa página a pantalla completa (p. ej. el monitor de funciones de Qwantic). Para taquilla, pon la pantalla en montaje «Normal (apaisada)».</p>';
  } else if(!pl){
    cuerpo='<div class="seg"><div class="field" style="flex:1;min-width:180px"><label>Cartel</label>'+
      '<select onchange="slotArchivo(\''+t+'\',this.value)">'+opcionesArchivo(d.archivo||'')+'</select></div></div>';
  } else {
    var L=d.lista||[]; var total=0;
    var filas=L.map(function(it,i){
      var v=it.archivo, vid=esVideo(v);
      if(!vid) total+=(it.segundos>0?it.segundos:10); else if(it.segundos>0) total+=it.segundos;
      var pn=v.replace(/'/g,"\\'");
      var prev = vid?'<span class="ico" onclick="abrirLightbox(\''+pn+'\')">🎬</span>':'<img src="'+urlDe(v)+'" onclick="abrirLightbox(\''+pn+'\')">';
      var segCtl = vid
        ? '<input type="number" min="0" placeholder="auto" value="'+(it.segundos>0?it.segundos:'')+'" title="segundos (vacío = vídeo entero)" onchange="slotItemSeg(\''+t+'\','+i+',this.value)"> s <span class="dim" id="dur_'+t+'_'+i+'" style="font-size:.7rem;white-space:nowrap"></span>'
        : '<input type="number" min="1" value="'+(it.segundos>0?it.segundos:10)+'" onchange="slotItemSeg(\''+t+'\','+i+',this.value)"> s';
      var girChk=rota?('<label class="chk" style="font-size:.72rem" title="Girar este cartel (márcalo si está derecho)"><input type="checkbox" '+(it.girar!==false?'checked':'')+' onchange="slotItemGirar(\''+t+'\','+i+',this.checked)">girar</label>'):'';
      var showSel='<select class="showsel" title="Espectáculo (para mostrar su próxima función)" onchange="slotItemShow(\''+t+'\','+i+',this.value)">'+opcionesShow(it.show)+'</select>';
      return '<div class="plitem">'+prev+'<span class="nm">'+v+'</span>'+segCtl+girChk+showSel+
        '<span class="ctrl"><button class="btn sm ghost" title="Subir" onclick="slotItemMover(\''+t+'\','+i+',-1)">▲</button>'+
        '<button class="btn sm ghost" title="Bajar" onclick="slotItemMover(\''+t+'\','+i+',1)">▼</button>'+
        '<button class="btn sm ghost" title="Duplicar" onclick="slotItemDup(\''+t+'\','+i+')">⧉</button>'+
        '<button class="btn sm danger" title="Quitar" onclick="slotItemDel(\''+t+'\','+i+')">✕</button></span></div>';
    }).join('');
    var add='<div class="pl-add" ondragover="permitir(event);this.classList.add(\'drag\')" ondragleave="this.classList.remove(\'drag\')" ondrop="soltarEnPlaylist(event,\''+t+'\')">'+
      'Arrastra aquí carteles o archivos · <select id="plSel_'+t+'">'+opcionesArchivo('')+'</select> '+
      '<button class="btn sm" onclick="addDesdeSelect(\''+t+'\')">Añadir</button> '+
      '<button class="btn sm" onclick="pedirArchivoPlaylist(\''+t+'\')">⬆ Subir nuevo</button></div>';
    cuerpo='<p class="dim" style="font-size:.78rem;margin:6px 0">En bucle, en orden. Repite, mezcla imágenes y vídeos y pon su duración (vídeos: vacío = entero).</p>'+
      filas+add+
      '<p class="dim" style="font-size:.76rem;margin-top:8px">Bucle: ~'+total+' s'+(L.some(function(it){return esVideo(it.archivo)&&!(it.segundos>0);})?' + los vídeos en "auto"':'')+'.</p>';
  }
  var girGlobal = (pl||web||!rota) ? '' :
    '<div class="seg" style="margin-top:10px"><label class="chk"><input type="checkbox" '+(d.girar!==false?'checked':'')+' onchange="slotGirar(\''+t+'\',this.checked)"> Girar para la pantalla (márcalo si el cartel está derecho)</label></div>';
  return toggle+cuerpo+girGlobal;
}
function renderPorDefecto(){
  var cont=document.getElementById('porDefecto'); if(!P()){ cont.innerHTML=''; return; }
  if(!P().programados) P().programados=[];
  var hoy=ymd(new Date());
  var actIdx=defaultActivoIdx(P(),hoy);
  var html='<div class="dgrupo"><div class="dim" style="font-size:.78rem;margin-bottom:6px">Base — se ve siempre, salvo que un cambio programado ya esté activo'+(actIdx==='base'?' <b style="color:var(--ok)">(activo ahora)</b>':'')+'</div>'+renderContenido('base')+'</div>';
  P().programados.forEach(function(pr,i){
    var est = !pr.desde ? '<span style="color:var(--bad)">elige una fecha</span>'
      : (pr.desde>hoy ? '⏳ programado para '+pr.desde
        : (actIdx===i ? '<b style="color:var(--ok)">✅ activo desde '+pr.desde+'</b>'
          : '🗂️ anterior (inactivo) · '+pr.desde));
    html+='<div class="dgrupo prog"><div class="seg" style="margin-top:0">'+
      '<div class="field"><label>A partir del día</label><input type="date" value="'+(pr.desde||'')+'" onchange="setProgDesde('+i+',this.value)"></div>'+
      '<span class="dim" style="font-size:.78rem">'+est+'</span>'+
      '<button class="btn ghost sm" title="Duplicar" style="margin-left:auto" onclick="dupProgramado('+i+')">⧉</button>'+
      '<button class="btn danger sm" title="Quitar" onclick="delProgramado('+i+')">🗑</button>'+
      '</div>'+renderContenido(i)+'</div>';
  });
  html+='<button class="btn" style="margin-top:4px" onclick="addProgramado()">＋ Programar un cambio del por defecto</button>';
  cont.innerHTML=html;
  rellenarDuracionesDefecto();
}
function rellenarDuracionesDefecto(){
  function fill(t,lista){ (lista||[]).forEach(function(it,i){ if(esVideo(it.archivo)) pedirDuracion(it.archivo,function(dr){ var el=document.getElementById('dur_'+t+'_'+i); if(el) el.textContent=dr>0?('dura '+fmtDur(dr)):''; }); }); }
  var b=P().porDefecto; if(b&&b.lista) fill('base',b.lista);
  (P().programados||[]).forEach(function(pr,i){ if(pr.lista) fill(String(i),pr.lista); });
}
function dObj(t){ if(t==='base'){ return P().porDefecto||(P().porDefecto={girar:true}); } return P().programados[parseInt(t,10)]; }
function defaultActivoIdx(p,hoy){ var idx='base', f=''; (p.programados||[]).forEach(function(pr,i){ if(pr.desde&&(pr.archivo||pr.lista||pr.url)&&pr.desde<=hoy&&pr.desde>=f){ idx=i; f=pr.desde; } }); return idx; }
function defaultActivoObj(p,ahora){ var hoy=ymd(ahora), mejor=p.porDefecto||null, f=''; (p.programados||[]).forEach(function(pr){ if(pr.desde&&(pr.archivo||pr.lista||pr.url)&&pr.desde<=hoy&&pr.desde>=f){ mejor=pr; f=pr.desde; } }); return mejor; }
function addProgramado(){ if(!P().programados) P().programados=[]; P().programados.push({desde:'',girar:true,archivo:''}); cambiado(); renderPorDefecto(); preview(); }
function setProgDesde(i,v){ P().programados[i].desde=v; cambiado(); renderPorDefecto(); preview(); }
function delProgramado(i){ P().programados.splice(i,1); cambiado(); renderPorDefecto(); preview(); }
function dupProgramado(i){ var c=JSON.parse(JSON.stringify(P().programados[i])); P().programados.splice(i+1,0,c); cambiado(); renderPorDefecto(); preview(); }
function semillaItem(d){ return {archivo:d.archivo,segundos:10,girar:(d.girar!==false)}; }
function slotModo(t,modo){ var d=dObj(t);
  if(modo==='playlist'){ if(!d.lista){ d.lista=d.archivo?[semillaItem(d)]:[]; } delete d.archivo; delete d.url; }
  else if(modo==='web'){ if(d.url==null) d.url=''; delete d.lista; delete d.archivo; d.girar=false; }
  else { if(d.lista){ var f0=d.lista[0]; d.archivo=f0?f0.archivo:''; d.girar=f0?(f0.girar!==false):true; delete d.lista; } delete d.url; if(d.archivo==null) d.archivo=''; }
  cambiado(); renderPorDefecto(); preview(); }
function slotArchivo(t,v){ var d=dObj(t); d.archivo=v; cambiado(); preview(); }
function slotUrl(t,v){ var d=dObj(t); d.url=v; cambiado(); preview(); }
function slotGirar(t,v){ var d=dObj(t); d.girar=v; cambiado(); preview(); }
function slotAddItem(t,n){ var d=dObj(t); if(!d.lista){ d.lista=d.archivo?[semillaItem(d)]:[]; delete d.archivo; } d.lista.push({archivo:n,segundos:10,girar:true}); cambiado(); renderPorDefecto(); preview(); }
function slotItemSeg(t,i,v){ dObj(t).lista[i].segundos=Math.max(0,parseInt(v,10)||0); cambiado(); preview(); }
function slotItemGirar(t,i,v){ dObj(t).lista[i].girar=v; cambiado(); preview(); }
function slotItemDup(t,i){ var L=dObj(t).lista, o=L[i]; L.splice(i+1,0,{archivo:o.archivo,segundos:o.segundos,girar:(o.girar!==false)}); cambiado(); renderPorDefecto(); preview(); }
function slotItemDel(t,i){ dObj(t).lista.splice(i,1); cambiado(); renderPorDefecto(); preview(); }
function slotItemMover(t,i,dir){ var L=dObj(t).lista,j=i+dir; if(j<0||j>=L.length)return; var tmp=L[i];L[i]=L[j];L[j]=tmp; cambiado(); renderPorDefecto(); preview(); }

// ════════════════════ Pantallas ════════════════════
function nuevaPantalla(){
  var nombre=prompt('Nombre de la nueva pantalla (p. ej. Marquesina):'); if(!nombre) return;
  var base=slugify(nombre), slug=base, i=2;
  while(config.pantallas[slug]) slug=base+'-'+(i++);
  config.pantallas[slug]={nombre:nombre.trim(),ancho:1920,alto:1080,grados:-90,porDefecto:null,franjas:[]};
  sel=slug; cambiado(); render();
}
function borrarPantalla(){
  if(sel==='principal') return;
  if(!confirm('¿Eliminar la pantalla "'+P().nombre+'"? Se borrará también su archivo HTML al guardar.')) return;
  delete config.pantallas[sel]; sel=Object.keys(config.pantallas)[0]||''; cambiado(); render();
}
function setP(k,v){ if(!P())return; P()[k]=v; cambiado(); if(k==='nombre'){renderTabs(); document.getElementById('nombreHorario').textContent='"'+v+'"';} renderAjustes(); if(k==='grados'){ renderPorDefecto(); renderFranjas(); } preview(); }

// ════════════════════ Edición de franjas ════════════════════
function toggleDia(i,d){ var f=P().franjas[i]; f.dias=f.dias||[]; var k=f.dias.indexOf(d); if(k>=0) f.dias.splice(k,1); else f.dias.push(d); cambiado(); renderFranjas(); preview(); }
function setF(i,k,v){ P().franjas[i][k]=v; cambiado();
  if(k==='archivo'||k==='nombre'||k==='desdeFecha'||k==='hastaFecha') renderFranjas();
  preview(); }
function addFranja(tipo){
  if(tipo==='fecha') P().franjas.push({tipo:'fecha',desdeFecha:ymd(new Date()),hastaFecha:'',desde:'00:00',hasta:'23:59',archivo:'',girar:true});
  else P().franjas.push({tipo:'semanal',dias:[5,6],desde:'22:00',hasta:'03:00',archivo:'',girar:true});
  cambiado(); renderFranjas(); preview();
}
function setTipo(i,t){ var f=P().franjas[i]; f.tipo=t;
  if(t==='fecha' && !f.desdeFecha) f.desdeFecha=ymd(new Date());
  if(t==='semanal' && !(f.dias&&f.dias.length)) f.dias=[5,6];
  cambiado(); renderFranjas(); preview(); }
function dupFranja(i){ var copia=JSON.parse(JSON.stringify(P().franjas[i])); copia.nombre=(copia.nombre?copia.nombre+' ':'')+'(copia)'; P().franjas.splice(i+1,0,copia); cambiado(); renderFranjas(); preview(); }
function delFranja(i){ P().franjas.splice(i,1); cambiado(); renderFranjas(); preview(); }

// ════════════════════ Carteles · subir / arrastrar / borrar ════════════════════
var uploadCb=null;   // qué hacer con el nombre tras subir (null = solo a la biblioteca)
function addArchivoLocal(nombre,size){ if(!archivos.some(function(a){return a.nombre===nombre;})) archivos.push({nombre:nombre,tipo:esVideo(nombre)?'video':'imagen',tam:size||0});
  archivos.sort(function(a,b){return a.nombre.localeCompare(b.nombre,'es');}); }
function permitir(e){ e.preventDefault(); }
function arrastrarCartel(e,nombre){ try{ e.dataTransfer.setData('text/cartel',nombre); e.dataTransfer.effectAllowed='copy'; }catch(_){} }
function soltarEnFranja(e,idx){ e.preventDefault(); e.currentTarget.classList.remove('drag');
  if(e.dataTransfer.files&&e.dataTransfer.files.length){ uploadCb=function(n){ if(P()&&P().franjas[idx]){P().franjas[idx].archivo=n; cambiado();} }; subir(e.dataTransfer.files[0]); return; }
  var n=e.dataTransfer.getData('text/cartel');
  if(n&&P()&&P().franjas[idx]){ P().franjas[idx].archivo=n; cambiado(); renderFranjas(); preview(); }
}
function pedirArchivoFranja(idx){ uploadCb=function(n){ if(P()&&P().franjas[idx]){P().franjas[idx].archivo=n; cambiado();} }; document.getElementById('fileInput').click(); }
function pedirArchivoPlaylist(t){ uploadCb=function(n){ slotAddItem(t,n); }; document.getElementById('fileInput').click(); }
function soltarEnPlaylist(e,t){ e.preventDefault(); e.currentTarget.classList.remove('drag');
  if(e.dataTransfer.files&&e.dataTransfer.files.length){ uploadCb=function(n){ slotAddItem(t,n); }; subir(e.dataTransfer.files[0]); return; }
  var n=e.dataTransfer.getData('text/cartel'); if(n) slotAddItem(t,n);
}
function addDesdeSelect(t){ var s=document.getElementById('plSel_'+t); if(s&&s.value) slotAddItem(t,s.value); }
function subir(file){ if(!file)return; if(soloLectura())return; var fd=new FormData(); fd.append('archivo',file); var cb=uploadCb; uploadCb=null;
  toast('Subiendo '+file.name+'…');
  api('subir',{method:'POST',form:fd}).then(function(r){ addArchivoLocal(r.nombre,file.size); if(cb) cb(r.nombre); render(); toast('Cartel subido ✓'); })
    .catch(function(e){ toast(e.msg||'Error al subir',true); });
  document.getElementById('fileInput').value='';
}
function usaArchivo(slot,n){ if(!slot) return false; if(slot.archivo===n) return true; if(slot.lista) return slot.lista.some(function(it){return it.archivo===n;}); return false; }
function usosDe(n){ var u=[]; Object.keys(config.pantallas).forEach(function(slug){ var p=config.pantallas[slug]; var nom=p.nombre||slug;
    (p.franjas||[]).forEach(function(f){ if(usaArchivo(f,n)) u.push(nom+' · '+(f.nombre||(esFecha(f)?'evento':'franja'))); });
    if(usaArchivo(p.porDefecto,n)) u.push(nom+' · por defecto');
    (p.programados||[]).forEach(function(pr){ if(usaArchivo(pr,n)) u.push(nom+' · programado'+(pr.desde?' '+pr.desde:'')); });
  }); return u; }
function quitaArchivo(slot,n){ if(!slot) return false; var ch=false;
  if(slot.archivo===n){ slot.archivo=''; ch=true; }
  if(slot.lista){ var L=slot.lista.length; slot.lista=slot.lista.filter(function(it){return it.archivo!==n;}); if(slot.lista.length!==L) ch=true; }
  return ch; }
function borrar(n){
  if(soloLectura())return;
  var usos=usosDe(n);
  var msg = usos.length
    ? '⚠️ "'+n+'" se está USANDO en:\n· '+usos.join('\n· ')+'\n\nSi lo borras, se quitará de ahí. ¿Seguro?'
    : '¿Borrar "'+n+'"? No se puede deshacer.';
  if(!confirm(msg)) return;
  api('borrar',{method:'POST',json:{nombre:n}}).then(function(){
    archivos=archivos.filter(function(a){return a.nombre!==n;});
    var tocado=false;
    Object.keys(config.pantallas).forEach(function(slug){ var p=config.pantallas[slug];
      (p.franjas||[]).forEach(function(f){ if(quitaArchivo(f,n)) tocado=true; });
      if(quitaArchivo(p.porDefecto,n)) tocado=true;
      (p.programados||[]).forEach(function(pr){ if(quitaArchivo(pr,n)) tocado=true; });
    });
    if(tocado) cambiado();
    render(); toast(tocado?'Borrado — recuerda Guardar':'Cartel borrado');
  }).catch(function(e){ toast(e.msg||'Error',true); }); }

// ════════════════════ Guardar ════════════════════
function guardar(){ if(soloLectura())return; api('guardar',{method:'POST',json:{config:config}}).then(function(){ marcar('Guardado ✓'); toast('Guardado ✓'); }).catch(function(e){ toast(e.msg||'Error al guardar',true); }); }
function cambiado(){ marcar('Cambios sin guardar'); }
function marcar(t){ document.getElementById('estadoGuardado').textContent=t; }

// ════════════════════ Vista previa ════════════════════
function ymd(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function esFecha(f){ return f.tipo==='fecha'; }
function ponerFechaHoy(){ var s=document.getElementById('simFecha'); if(s && !s.value) s.value=ymd(new Date()); }
function aMin(h){ var p=String(h).split(':'); return (+p[0])*60+(+p[1]); }
function coincideSemanal(f,ahora){ var dia=ahora.getDay(),ayer=(dia+6)%7,min=ahora.getHours()*60+ahora.getMinutes(),desde=aMin(f.desde),hasta=aMin(f.hasta);
  if(desde<hasta) return (f.dias||[]).indexOf(dia)>=0 && min>=desde && min<hasta;
  if((f.dias||[]).indexOf(dia)>=0 && min>=desde) return true;
  if((f.dias||[]).indexOf(ayer)>=0 && min<hasta) return true; return false; }
function coincideFecha(f,ahora){ var d1=f.desdeFecha,d2=f.hastaFecha||f.desdeFecha; if(!d1) return false; if(d2<d1){var t=d1;d1=d2;d2=t;}
  var hoy=ymd(ahora),ayer=ymd(new Date(ahora.getTime()-86400000)),min=ahora.getHours()*60+ahora.getMinutes(),desde=aMin(f.desde),hasta=aMin(f.hasta);
  function dentro(x){ return x>=d1 && x<=d2; }
  if(desde<hasta) return dentro(hoy)&&min>=desde&&min<hasta;
  if(dentro(hoy)&&min>=desde) return true;
  if(dentro(ayer)&&min<hasta) return true; return false; }
function elegir(ahora){ var p=P(); if(!p) return null; var fr=p.franjas||[];
  for(var i=0;i<fr.length;i++){ if((fr[i].archivo||fr[i].lista) && esFecha(fr[i]) && coincideFecha(fr[i],ahora)) return fr[i]; }
  for(var j=0;j<fr.length;j++){ if((fr[j].archivo||fr[j].lista) && !esFecha(fr[j]) && coincideSemanal(fr[j],ahora)) return fr[j]; }
  return defaultActivoObj(p,ahora); }
function simAhora(){ var n=new Date(); document.getElementById('simFecha').value=ymd(n); document.getElementById('simHora').value=('0'+n.getHours()).slice(-2)+':'+('0'+n.getMinutes()).slice(-2); preview(); }
function preview(){
  var p=P(); var tv=document.getElementById('tv'); var info=document.getElementById('simInfo');
  clearTimeout(previewTimer); previewTimer=null; previewGen++;
  if(!p){ tv.style.width='120px'; tv.style.height='200px'; tv.innerHTML='<div class="vacio">—</div>'; info.textContent=''; return; }
  var grados=(p.grados==null?-90:p.grados);
  var girado90=(grados===90||grados===-90);
  // Tamaño que ve el público (la tele como está montada)
  var vw=girado90?p.alto:p.ancho, vh=girado90?p.ancho:p.alto;
  var maxW=168,maxH=288, esc=Math.min(maxW/vw,maxH/vh);
  var fw=Math.max(20,Math.round(vw*esc)), fh=Math.max(20,Math.round(vh*esc));
  tv.style.width=fw+'px'; tv.style.height=fh+'px';

  ponerFechaHoy();
  var fecha=document.getElementById('simFecha').value, hora=document.getElementById('simHora').value||'00:00';
  var ahora=new Date(fecha+'T'+hora); if(isNaN(ahora.getTime())) ahora=new Date();
  var s=elegir(ahora);
  if(!s){ tv.innerHTML='<div class="vacio">(nada configurado)</div>'; info.textContent=''; return; }
  if(s.url){ tv.innerHTML='<div class="vacio" style="padding:6px;font-size:.7rem;line-height:1.3">🌐 Web<br><span style="opacity:.7;word-break:break-all">'+String(s.url).replace(/</g,'&lt;')+'</span></div>'; info.textContent='Muestra una web (URL)'; return; }
  var its=[];
  if(s.lista&&s.lista.length){ s.lista.forEach(function(it){ if(it.archivo) its.push({archivo:it.archivo,segundos:(+it.segundos||0),girar:(it.girar!==false)}); }); }
  else if(s.archivo){ its.push({archivo:s.archivo,segundos:0,girar:(s.girar!==false)}); }
  if(!its.length){ tv.innerHTML='<div class="vacio">(sin cartel)</div>'; info.textContent=''; return; }

  // Vista del público: cada cartel se endereza según SU propio "girar".
  function elem(it){
    var girar=(it.girar!==false), rot, w, h;
    if(girar){ rot=0; w=fw; h=fh; } else { rot=-grados; w=fh; h=fw; }
    var est = rot ? ('position:absolute;top:50%;left:50%;width:'+w+'px;height:'+h+'px;object-fit:cover;transform:translate(-50%,-50%) rotate('+rot+'deg)')
                  : 'width:100%;height:100%;object-fit:cover';
    return esVideo(it.archivo)
      ? '<video src="'+urlDe(it.archivo)+'" autoplay loop muted playsinline style="'+est+'"></video>'
      : '<img src="'+urlDe(it.archivo)+'" style="'+est+'">';
  }
  tv.innerHTML='<div class="capa"></div><div class="capa"></div>';
  var capas=[tv.children[0],tv.children[1]], act=0; capas[0].style.opacity=1;
  var mygen=previewGen;
  function show(i){ if(mygen!==previewGen) return; var it=its[i]; var nv=capas[(act+1)%2], vj=capas[act];
    nv.innerHTML=elem(it); nv.style.opacity=1; vj.style.opacity=0; act=(act+1)%2;
    if(its.length>1){ var seg=it.segundos>0?it.segundos:(esVideo(it.archivo)?(duraciones[it.archivo]>0?duraciones[it.archivo]:10):10); previewTimer=setTimeout(function(){ show((i+1)%its.length); }, Math.max(1,seg)*1000); }
  }
  show(0);
  var esDef=(s===p.porDefecto)||((p.programados||[]).indexOf(s)>=0);
  var cual=esDef?'por defecto':(esFecha(s)?'evento':'franja semanal');
  var et=its.length>1?('playlist · '+its.length+' carteles'):its[0].archivo;
  info.textContent=NOMBRE_DIA[ahora.getDay()]+' '+fecha+' '+hora+' → '+et+' ('+cual+')';
}
document.addEventListener('change',function(e){ if(e.target.id==='simFecha'||e.target.id==='simHora') preview(); });

// ════════════════════ Toast ════════════════════
var toastT;
function toast(t,bad){ var el=document.getElementById('toast'); el.textContent=t; el.style.borderColor=bad?'var(--bad)':'var(--line)'; el.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(function(){el.classList.remove('show');},2600); }

// ════════════════════ Popup (lightbox) ════════════════════
function abrirLightbox(n){ var c=document.getElementById('lbContent');
  c.innerHTML = esVideo(n) ? '<video src="'+urlDe(n)+'" controls autoplay loop muted playsinline></video>' : '<img src="'+urlDe(n)+'">';
  document.getElementById('lightbox').classList.add('show'); }
function cerrarLightbox(){ document.getElementById('lightbox').classList.remove('show'); document.getElementById('lbContent').innerHTML=''; }
document.addEventListener('keydown',function(e){ if(e.key==='Escape') cerrarLightbox(); });

// ════════════════════ Sesión confiada por madteatro (SSO) ════════════════════
function soloLectura(){ if(window.MAD_SSO && !MAD_SSO.edit){ toast('Modo solo lectura',true); return true; } return false; }
function entrarSSO(){
  CLAVE='';
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='block';
  if(!MAD_SSO.edit) activarSoloLectura();
  api('estado').then(aplicarEstado).then(function(){ marcar(MAD_SSO.edit?'Sin cambios':'Solo lectura'); })
    .catch(function(e){ document.getElementById('app').style.display='none'; document.getElementById('login').style.display='flex'; document.getElementById('loginErr').textContent=(e&&e.msg)||'No se pudo entrar con madteatro.'; });
}
function activarSoloLectura(){
  document.body.classList.add('lectura');
  var gb=document.querySelector('.savebar .btn.primary'); if(gb){ gb.disabled=true; gb.style.opacity=.45; gb.style.cursor='not-allowed'; }
  var b=document.createElement('div');
  b.textContent='👁 Solo lectura · abierto desde madteatro'+(MAD_SSO.name?(' como '+MAD_SSO.name):'')+' — no puedes guardar cambios.';
  b.style.cssText='position:sticky;top:0;z-index:9;background:#8a6d1f;color:#fff;padding:8px 14px;font-size:.84rem;text-align:center';
  var app=document.getElementById('app'); app.insertBefore(b, app.firstChild);
}
// ════════════════════ Arranque ════════════════════
(function(){
  if(window.MAD_SSO){ entrarSSO(); return; }    // entró por madteatro: sin contraseña
  var g=sessionStorage.getItem('clavePanel'); if(g){ document.getElementById('pass').value=g; entrar(); }
})();
</script>
</body>
</html>
