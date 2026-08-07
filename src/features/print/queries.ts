import { createClient } from "@/lib/supabase/server";
import type { PrintSettings } from "@/features/pos/receipt";
import { DEFAULT_PRINT } from "@/features/pos/receipt";

export interface PrintConfig extends PrintSettings {
  fontFamily: "editorial" | "mono" | "grotesk";
  qrUrl: string | null;
  qrCaption: string | null;
  qrHandle: string | null;
}

export const DEFAULT_CONFIG: PrintConfig = {
  ...DEFAULT_PRINT,
  fontFamily: "editorial",
  qrUrl: null,
  qrCaption: "Follow us",
  qrHandle: null,
};

export async function getPrintConfig(): Promise<PrintConfig> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("print_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data) return DEFAULT_CONFIG;

  return {
    paperMm: Number(data.paper_mm ?? 80),
    printWidthMm: Number(data.print_width_mm ?? 72),
    sideMarginMm: Number(data.side_margin_mm ?? 3),
    baseFontPx: Number(data.base_font_px ?? 12),
    boldBody: Boolean(data.bold_body ?? true),
    showSavings: Boolean(data.show_savings ?? true),
    showGstBlock: Boolean(data.show_gst_block ?? true),
    showBarcode: Boolean(data.show_barcode ?? true),
    footerFeedMm: Number(data.footer_feed_mm ?? 6),
    layout: (data.layout ?? "standard") as PrintConfig["layout"],
    mastheadName: data.masthead_name ?? null,
    tagline: data.tagline ?? null,
    showTagline: Boolean(data.show_tagline ?? true),
    addressFontPx: Number(data.address_font_px ?? 10),
    itemFontPx: Number(data.item_font_px ?? 13),
    fontFamily: (data.font_family ?? "editorial") as PrintConfig["fontFamily"],
    qrUrl: data.qr_url ?? null,
    qrCaption: data.qr_caption ?? "Follow us",
    qrHandle: data.qr_handle ?? null,
  };
}
