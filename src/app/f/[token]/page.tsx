import { notFound } from "next/navigation";
import { findLoopShareByToken } from "@/lib/loop-share-db";
import { toPublicLoopShareRecord } from "@/lib/loop-share-types";
import { findPopulateShareByToken } from "@/lib/populate-share-db";
import { isPopulateShareAccessible, isPastIsoDate } from "@/lib/populate-share-access";
import { toPublicPopulateShareRecord } from "@/lib/populate-share-types";

import { PublicLoopFormClient } from "./PublicLoopFormClient";
import { PublicDesignerFormClient } from "./PublicDesignerFormClient";
import { PublicPopulateFormClient } from "./PublicPopulateFormClient";

export default async function PublicFormPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  const populateRow = await findPopulateShareByToken(token);
  if (populateRow) {
    if (!isPopulateShareAccessible(populateRow)) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#120810] px-4 text-center text-sm text-white/70">
          Este formulario ya no está disponible.
        </div>
      );
    }
    return <PublicPopulateFormClient initial={toPublicPopulateShareRecord(populateRow)} />;
  }

  const row = await findLoopShareByToken(token);
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

  const record = toPublicLoopShareRecord(row);
  if (record.payload.designer) {
    return <PublicDesignerFormClient initial={record} />;
  }
  return <PublicLoopFormClient initial={record} />;
}
