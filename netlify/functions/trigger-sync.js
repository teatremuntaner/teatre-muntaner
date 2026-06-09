// Función serverless: lanza el workflow "Sync Qwantic" de GitHub Actions.
// Protegida por Netlify Identity (solo personal logueado) y con enfriamiento
// para que no se pueda abusar. El despliegue real solo ocurre si hay cambios.

const REPO = "teatremuntaner/teatre-muntaner";
const WORKFLOW = "sync-qwantic.yml";
const COOLDOWN_MIN = 10;

function resp(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return resp(405, { error: "Método no permitido." });

  // 1) Solo personal logueado (Netlify Identity rellena clientContext.user)
  const user = context.clientContext && context.clientContext.user;
  if (!user) return resp(401, { error: "Tienes que iniciar sesión para actualizar." });

  // 2) Token guardado en Netlify
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return resp(500, { error: "Falta configurar GH_DISPATCH_TOKEN en Netlify." });

  const gh = (path, opts = {}) =>
    fetch(`https://api.github.com/repos/${REPO}/${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "teatre-muntaner-sync",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.headers || {}),
      },
    });

  // 3) Enfriamiento: no relanzar si hay una ejecución reciente o en curso
  try {
    const r = await gh(`actions/workflows/${WORKFLOW}/runs?per_page=1`);
    if (r.ok) {
      const j = await r.json();
      const last = j.workflow_runs && j.workflow_runs[0];
      if (last) {
        const ageMin = (Date.now() - new Date(last.created_at).getTime()) / 60000;
        if (last.status !== "completed") {
          return resp(429, { error: "Ya hay una actualización en curso. Espera a que termine (~2-3 min)." });
        }
        if (ageMin < COOLDOWN_MIN) {
          const wait = Math.ceil(COOLDOWN_MIN - ageMin);
          return resp(429, { error: `Acabas de actualizar. Vuelve a intentarlo en ${wait} min.` });
        }
      }
    }
  } catch (e) {
    // si falla la comprobación, seguimos (el workflow ya evita solapes)
  }

  // 4) Disparar el workflow
  const d = await gh(`actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main" }),
  });
  if (d.status === 204) {
    return resp(200, { ok: true, message: "Actualización lanzada. En 2-3 minutos la cartelera estará al día." });
  }
  const detail = await d.text().catch(() => "");
  return resp(502, { error: "No se pudo lanzar la actualización.", detail });
};
