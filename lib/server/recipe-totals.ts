import type { ComponentPreferenceStatus } from "@/lib/contracts/api";

export type TotalComponent = {
  itemId: string;
  quantity: number;
  preference: ComponentPreferenceStatus;
  unitPriceAuec: number | null;
};

export function calculateRecipeTotal(components: readonly TotalComponent[]) {
  let valueAuec = 0;
  const missingItemIds: string[] = [];
  for (const component of components) {
    if (component.preference !== "needed") continue;
    if (component.unitPriceAuec === null) {
      missingItemIds.push(component.itemId);
    } else {
      valueAuec += component.unitPriceAuec * component.quantity;
    }
  }
  return { valueAuec, complete: missingItemIds.length === 0, missingItemIds };
}
