/**
 * Política absoluta de APIs de pago en Foldder.
 * Regla Cursor: `.cursor/rules/no-paid-api-calls-without-warning.mdc` (alwaysApply).
 *
 * INVIOLABLE: tras un error en proveedor de pago (copyright, safety, timeout, 5xx, etc.)
 * NO se rellama, NO hay fallback silencioso, NO hay segundo intento en catch.
 * Solo el usuario, con gesto explícito y confirmación wallet si aplica, puede volver a intentar.
 */
export const PAID_API_NO_AUTO_RETRY_ON_ERROR = true as const;

export type PaidApiPolicy = typeof PAID_API_NO_AUTO_RETRY_ON_ERROR;
