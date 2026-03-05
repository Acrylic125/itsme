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
  id: string;
  anchor: AnchorRect;
  content: ReactNode;
};

type DomPopupApi = {
  openPopup: (args: {
    id: string;
    anchor: AnchorRect;
    content: ReactNode;
  }) => void;
  closePopup: () => void;
  isOpen: boolean;
  currentId: string | null;
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
  const [measuredSize, setMeasuredSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const [isVisible, setIsVisible] = useState(false);

  const closePopup = useCallback(() => {
    // fade out, then clear
    setIsVisible(false);
    setTimeout(() => {
      setPopup(null);
      setMeasuredSize(null);
    }, 150);
  }, []);

  const openPopup = useCallback(
    (args: { id: string; anchor: AnchorRect; content: ReactNode }) => {
      setPopup({ id: args.id, anchor: args.anchor, content: args.content });
      setMeasuredSize(null);
      // kick animation on next frame
      setIsVisible(false);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    },
    []
  );

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
    () => ({
      openPopup,
      closePopup,
      isOpen: popup != null && isVisible,
      currentId: popup?.id ?? null,
    }),
    [openPopup, closePopup, popup, isVisible]
  );

  const anchor = popup?.anchor ?? null;
  const gap = 8;

  let style: React.CSSProperties | undefined;
  if (popup && anchor) {
    const w = anchor.width;
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
      width: w,
      transformOrigin: belowOverflows ? "left bottom" : "left top",
      transform: isVisible ? "scale(1)" : "scale(0.2)",
      opacity: isVisible ? 1 : 0,
      transition:
        "opacity 0.12s ease-in-out, transform 0.12s ease-in-out, top 0.12s ease-in-out",
    };
  }

  return (
    <DomPopupContext.Provider value={api}>
      {children}
      {popup && (
        <div ref={popupRef} style={style} role="dialog" aria-modal="false">
          {popup.content}
        </div>
      )}
    </DomPopupContext.Provider>
  );
}
