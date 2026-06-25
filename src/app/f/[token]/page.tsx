import { notFound } from "next/navigation";
import { findPopulateShareByToken } from "@/lib/populate-share-db";
import { toPublicPopulateShareRecord } from "@/lib/populate-share-types";
import { PublicPopulateFormClient } from "./PublicPopulateFormClient";

function isPastIsoDate(value: string): boolean {
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

export default async function PublicPopulateFormPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const row = await findPopulateShareByToken(token);
  if (!row) notFound();

  if (!row.options.enabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#120810] px-4 text-center text-sm text-white/70">
        Este formulario ya no está disponible.
      </div>
    );
  }
  if (row.options.autoDisableAt && isPastIsoDate(row.options.autoDisableAt)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#120810] px-4 text-center text-sm text-white/70">
        Este enlace ha expirado.
      </div>
    );
  }

  return <PublicPopulateFormClient initial={toPublicPopulateShareRecord(row)} />;
}
