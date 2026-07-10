/** Mensajes legibles para códigos de error del API logo-intake. */
const LOGO_INTAKE_ERROR_ES: Record<string, string> = {
  request_failed: "No se pudo completar la petición. Inténtalo de nuevo.",
  load_failed: "No se pudo cargar el estado del logo.",
  validate_failed: "No se pudo validar el logo seleccionado.",
  manual_failed: "No se pudo subir el logo manual.",
  undo_failed: "No se pudo deshacer la validación.",
  missing_project_id: "Falta el identificador del proyecto.",
  missing_candidate_id: "No hay candidato seleccionado.",
  missing_fields: "Faltan datos en la petición.",
  missing_files: "No se recibió ningún archivo.",
  missing_params: "Parámetros incompletos.",
  proposal_not_found: "No hay propuesta de logo pendiente.",
  not_validated: "El logo aún no está validado.",
  svg_not_found: "No se encontró el SVG del logo.",
  asset_not_found: "No se encontró el archivo del logo.",
  vectorize_empty: "La vectorización no produjo resultado.",
  vectorizer_not_configured: "El vectorizador no está configurado en el servidor.",
  insufficient_balance: "Saldo insuficiente en el wallet.",
  network_error: "Error de red. Comprueba la conexión.",
};

export function humanizeLogoIntakeError(codeOrMessage: string): string {
  const key = codeOrMessage.trim().toLowerCase();
  if (LOGO_INTAKE_ERROR_ES[key]) return LOGO_INTAKE_ERROR_ES[key];
  if (key.startsWith("http_")) return `Error del servidor (${key.replace("http_", "")}).`;
  if (key.includes("insufficient_balance")) return LOGO_INTAKE_ERROR_ES.insufficient_balance;
  if (/^[a-z0-9_]+$/.test(key) && key.includes("_")) {
    return `Error de logo (${codeOrMessage.replace(/_/g, " ")}).`;
  }
  return codeOrMessage;
}
