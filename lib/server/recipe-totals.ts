import type { ComponentPreferenceStatus } from "@/lib/contracts/api";

export type TotalComponent = {
  itemId: string;
  quantity: number;
  preference: ComponentPreferenceStatus;
  unitPriceAuec: number | null;
  allocation?: { ownedQuantity: number; farmableQuantity: number };
};

export function calculateRecipeTotal(components: readonly TotalComponent[]) {
  let valueAuec = 0;
  const missingItemIds: string[] = [];
  for (const component of components) {
    const allocated = component.allocation
      ? Math.min(component.quantity, component.allocation.ownedQuantity + component.allocation.farmableQuantity)
      : component.preference === "needed" ? 0 : component.quantity;
    const neededQuantity = component.quantity - allocated;
    if (neededQuantity <= 0) continue;
    if (component.unitPriceAuec === null) {
      missingItemIds.push(component.itemId);
    } else {
      valueAuec += component.unitPriceAuec * neededQuantity;
    }
  }
  return { valueAuec, complete: missingItemIds.length === 0, missingItemIds };
}
