"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type AnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PopupState = {
  anchor: AnchorRect;
  text: string;
};

type DomPopupApi = {
  openPopup: (args: { anchor: AnchorRect; text: string }) => void;
  closePopup: () => void;
  isOpen: boolean;
};

const DomPopupContext = createContext<DomPopupApi | null>(null);

export function useDomPopup(): DomPopupApi {
  const ctx = useContext(DomPopupContext);
  if (!ctx) {
    throw new Error("DomPopupProvider not provided");
  }
  return ctx;
}

export function DomPopupProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [measuredSize, setMeasuredSize] = useState<{ w: number; h: number } | null>(
    null
  );

  const closePopup = useCallback(() => {
    setPopup(null);
    setMeasuredSize(null);
  }, []);

  const openPopup = useCallback((args: { anchor: AnchorRect; text: string }) => {
    setPopup({ anchor: args.anchor, text: args.text });
    setMeasuredSize(null);
  }, []);

  useEffect(() => {
    if (!popup) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopup();
    };

    // capture so we can close before other handlers, and so Konva doesn't swallow it
    const onPointerDownCapture = (e: PointerEvent) => {
      const el = popupRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      closePopup();
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
    };
  }, [popup, closePopup]);

  useLayoutEffect(() => {
    if (!popup) return;
    const el = popupRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMeasuredSize({ w: r.width, h: r.height });
  }, [popup]);

  const api = useMemo<DomPopupApi>(
    () => ({ openPopup, closePopup, isOpen: popup != null }),
    [openPopup, closePopup, popup]
  );

  const anchor = popup?.anchor ?? null;
  const gap = 8;

  let style: React.CSSProperties | undefined;
  if (popup && anchor) {
    const w = measuredSize?.w ?? 180;
    const h = measuredSize?.h ?? 40;

    const preferBelowTop = anchor.top + anchor.height + gap;
    const belowOverflows = preferBelowTop + h > window.innerHeight - gap;
    const top = belowOverflows ? anchor.top - gap - h : preferBelowTop;

    const left = Math.min(
      Math.max(gap, anchor.left),
      Math.max(gap, window.innerWidth - gap - w)
    );

    style = {
      position: "fixed",
      left,
      top: Math.max(gap, top),
      zIndex: 1000,
      background: "#ffffff",
      color: "#000000",
      border: "1px solid #e5e7eb",
      borderRadius: 8,
      padding: "10px 12px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
      fontSize: 14,
      lineHeight: 1.2,
      maxWidth: 320,
    };
  }

  return (
    <DomPopupContext.Provider value={api}>
      {children}
      {popup && (
        <div ref={popupRef} style={style} role="dialog" aria-modal="false">
          {popup.text}
        </div>
      )}
    </DomPopupContext.Provider>
  );
}

