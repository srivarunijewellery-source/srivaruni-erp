"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Reads a tag with the phone's camera instead of a hardware scanner.
 *
 * On the rail, a picker holds a piece in one hand and a phone in the
 * other. Typing a twelve-character code between them is the slow step,
 * and the mis-keyed ones are how a transfer ends up with a piece nobody
 * asked for.
 *
 * Two decoders, chosen at runtime.
 *
 * Where the browser has BarcodeDetector — Chrome on Android — that is
 * used: hardware-accelerated, nothing added to the bundle, a Code128 tag
 * read in a frame or two.
 *
 * iPhone has no such thing, and never will while Apple requires every
 * iOS browser to run on WebKit: Chrome and Firefox on an iPhone are
 * Safari underneath and share the same gap. So a JavaScript decoder is
 * loaded there instead — but by dynamic import, only on the devices that
 * need it. An Android phone never downloads it, which matters when the
 * counter loads over shop wifi.
 */

/** Not in TypeScript's DOM types yet. */
type DetectedBarcode = { rawValue: string; format: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

export function CameraScanner({
  onScan,
  disabled,
}: {
  onScan: (code: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // Same tag stays in frame for many frames after a read. Without this
  // the same piece is counted a dozen times in a second.
  const recentRef = useRef<{ code: string; at: number } | null>(null);

  // Decided once the component mounts: reading `window` during render
  // would disagree between the server pass and the browser one.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOpen(false);
  }, []);

  // Camera off when the component goes away. A live camera on an
  // abandoned page is both a battery drain and a thing people notice.
  useEffect(() => () => stop(), [stop]);

  /**
   * The fallback decoder, fetched only when the native one is absent.
   *
   * Wrapped to look like BarcodeDetector so the frame loop below does
   * not care which it got — one code path for both, rather than two that
   * drift apart.
   */
  const loadFallback = useCallback(async (): Promise<BarcodeDetectorLike> => {
    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] =
      await Promise.all([import("@zxing/browser"), import("@zxing/library")]);

    const hints = new Map();
    // Narrowed to the symbologies actually printed on your labels.
    // Left open, the decoder spends most of each frame ruling out
    // formats that will never appear.
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
    ]);
    const reader = new BrowserMultiFormatReader(hints);

    // One canvas reused across frames. Allocating a new one per frame is
    // what makes JavaScript decoders feel sluggish on a phone.
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    return {
      detect: async (source) => {
        const video = source as HTMLVideoElement;
        if (!ctx || !video.videoWidth) return [];

        // Downscaled to 640px wide. A Code128 tag decodes comfortably at
        // that size, and the decoder's work grows with the pixel count —
        // full resolution costs several times as much for no more reads.
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          const r = reader.decodeFromCanvas(canvas);
          return r ? [{ rawValue: r.getText(), format: "code_128" }] : [];
        } catch {
          // No barcode in this frame. Normal, and not worth surfacing.
          return [];
        }
      },
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The rear camera, and asking for a high enough resolution that
        // the narrow bars of a Code128 tag survive.
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      setOpen(true);

      // The <video> is mounted at all times, hidden until now.
      //
      // It used to be rendered only when `open` was true, and this line
      // ran immediately after setOpen — before React had re-rendered. So
      // videoRef.current was still null, the function returned early,
      // and the stream was acquired but never attached: the camera light
      // came on, permission was granted, and the panel stayed black.
      const video = videoRef.current;
      if (!video) {
        setError("The camera preview could not start. Reload the page and try again.");
        stop();
        return;
      }
      video.srcObject = stream;
      // iOS needs both of these set on the element itself, not just as
      // React props, before play() will succeed inside a gesture.
      video.setAttribute("playsinline", "true");
      video.muted = true;
      await video.play();

      // play() resolves before the first frame has dimensions, and a
      // detector handed a 0x0 video reads nothing while looking
      // perfectly healthy. Wait for real pixels, but not forever — if
      // they never arrive, say so rather than sitting on a black panel.
      const gotFrame = await new Promise<boolean>((resolve) => {
        if (video.videoWidth > 0) return resolve(true);
        const done = () => {
          video.removeEventListener("loadeddata", done);
          resolve(video.videoWidth > 0);
        };
        video.addEventListener("loadeddata", done);
        setTimeout(done, 4000);
      });

      if (!gotFrame) {
        setError(
          "The camera started but sent no picture. Close any other app or tab using it, then try again.",
        );
        stop();
        return;
      }

      const Ctor = detectorCtor();
      const native = Ctor !== null;
      const detector: BarcodeDetectorLike = Ctor
        ? new Ctor({ formats: ["code_128", "code_39", "ean_13"] })
        : await loadFallback();

      // The native detector is cheap enough to run on every frame. The
      // JavaScript one is not — at sixty attempts a second an iPhone
      // gets hot and the video stutters, which reads as the scanner
      // being broken. Ten a second is still faster than anyone can move
      // a tag into frame.
      const minGapMs = native ? 0 : 100;
      let lastRun = 0;

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;

        const now = performance.now();
        if (now - lastRun < minGapMs) {
          rafRef.current = requestAnimationFrame(() => void tick());
          return;
        }
        lastRun = now;

        try {
          const found = await detector.detect(videoRef.current);
          const hit = found[0]?.rawValue?.trim();
          if (hit) {
            const now = Date.now();
            const recent = recentRef.current;
            // Two seconds before the same tag counts again — long enough
            // to move the piece out of frame, short enough that two of
            // the same design in a row still both register.
            if (!recent || recent.code !== hit || now - recent.at > 2000) {
              recentRef.current = { code: hit, at: now };
              setLastCode(hit);
              // A short buzz, where the device offers one: on a noisy
              // shop floor it is the only feedback that reliably lands.
              navigator.vibrate?.(40);
              onScan(hit);
            }
          }
        } catch {
          // A dropped frame is not worth reporting; the next one is
          // milliseconds away.
        }
        rafRef.current = requestAnimationFrame(() => void tick());
      };
      rafRef.current = requestAnimationFrame(() => void tick());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission")
          ? "Camera access was refused. Allow it in the browser's site settings and try again."
          : `The camera could not start: ${msg}`,
      );
      stop();
    }
  }, [onScan, stop, loadFallback]);

  // Rendered on every browser now: the fallback covers the ones without
  // a native decoder, so there is no device where the button cannot
  // work.
  if (!ready) return null;

  return (
    <div className="space-y-2">
      {!open && (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => void start()}
        >
          Scan with the camera
        </Button>
      )}

      {/* Always in the DOM so the ref is populated before a stream is
          attached; only the wrapper is hidden. */}
      <div className={open ? "space-y-2" : "hidden"}>
          <div className="relative overflow-hidden rounded-card border border-border bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-56 w-full object-cover"
            />
            {/* A window to aim through. People hold the phone much closer
                than they need to without one. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-16 w-4/5 rounded border-2 border-white/70" />
            </div>
            {lastCode && (
              <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-control bg-black/70 px-2 py-1 font-mono text-2xs text-white">
                {lastCode}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={stop}>
              Stop the camera
            </Button>
            <span className="text-2xs text-text-muted">
              Hold the tag inside the box. It keeps reading until you stop.
            </span>
          </div>
      </div>

      {error && <p className="text-2xs text-status-danger-fg">{error}</p>}
    </div>
  );
}
