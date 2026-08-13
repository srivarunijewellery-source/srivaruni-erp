/**
 * Shared between the server query and the client grid, so neither pulls
 * the other's module into the wrong bundle.
 */
export interface NotPickedRow {
  itemId: string;
  barcode: string;
  name: string;
  category: string;
  style: string;
  photoPath: string | null;
  sellingPricePaise: number;
  missed: number;
  onShelf: number;
  valuePaise: number;
  docNo: string;
  reason: string;
  fromCode: string;
  toCode: string;
  pickedAt: string | null;
}
