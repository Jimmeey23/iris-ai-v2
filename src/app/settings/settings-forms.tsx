"use client";
import { FormRoutingBuilder } from "@/components/form-routing-builder";
import { DEPARTMENT_RECORDS } from "@/lib/constants";
import type { useSettingsPageController } from "./settings-controller";
export default function SettingsFormsPanel({
  model,
}: {
  model: ReturnType<typeof useSettingsPageController>;
}) {
  const { cfg, setCfg, staff } = model;
  if (!cfg) return null;
  return (
    <FormRoutingBuilder
      config={cfg}
      onChange={setCfg}
      staff={staff}
      departments={DEPARTMENT_RECORDS}
    />
  );
}
