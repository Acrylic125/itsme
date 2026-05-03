"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type AnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// type PopupState = {
//   anchor: AnchorRect;
//   popupKey: string;
//   onClose?: () => void;
//   content: ({ closePopup }: { closePopup: () => void }) => ReactNode;
// };

// type DomPopupApi = {
//   openPopup: (args: PopupState) => void;
//   closePopup: () => void;
// } & (
//   | {
//       isOpen: true;
//       popupKey: string;
//     }
//   | {
//       isOpen: false;
//       popupKey: null;
//     }
// );

type DomPopupApi = {
  popupContainer: HTMLDivElement | null;
};

const DomPopupContext = createContext<DomPopupApi>({
  popupContainer: null,
});

export function useDomPopup(): DomPopupApi {
  const ctx = useContext(DomPopupContext);
  if (!ctx) {
    throw new Error("DomPopupProvider not provided");
  }
  return ctx;
}

export function DomPopupProvider({ children }: { children: ReactNode }) {
  const [popupContainer, setPopupContainer] = useState<HTMLDivElement | null>(
    null
  );
  // const [popups, setPopups] = useState<
  //   | {
  //       state: PopupState;
  //       isOpen: boolean;
  //     }
  //   | {
  //       state: null;
  //       isOpen: false;
  //     }
  // >({
  //   state: null,
  //   isOpen: false,
  // });
  // const closePopup = useCallback(() => {
  //   setPopups((prev) => {
  //     prev.state?.onClose?.();
  //     return {
  //       ...prev,
  //       isOpen: false,
  //     };
  //   });
  // }, []);
  // const openPopup = useCallback((state: PopupState) => {
  //   setPopups((prev) => ({
  //     ...prev,
  //     state,
  //     isOpen: true,
  //   }));
  // }, []);

  // useEffect(() => {
  //   // Check if user presses ESC key
  //   const handleEscape = (event: KeyboardEvent) => {
  //     if (event.key === "Escape") {
  //       closePopup();
  //     }
  //   };
  //   document.addEventListener("keydown", handleEscape);
  //   return () => document.removeEventListener("keydown", handleEscape);
  // }, [closePopup]);

  return (
    <DomPopupContext.Provider
      value={{
        popupContainer,
      }}
      // value={{
      //   openPopup,
      //   closePopup,
      //   ...(popups.isOpen
      //     ? { isOpen: true, popupKey: popups.state.popupKey }
      //     : { isOpen: false, popupKey: null }),
      // }}
    >
      <div className="relative w-full h-full" ref={setPopupContainer}>
        {children}
        {/* {popups.isOpen && (
          <div
            role="dialog"
            className="absolute inset-0 z-50"
            style={
              {
                left: `${popups.state.anchor.left * 100}%`,
                top: `${popups.state.anchor.top * 100}%`,
                width: `${popups.state.anchor.width * 100}%`,
                height: `${popups.state.anchor.height * 100}%`,
              }
            }
          >
            {popups.state.content({ closePopup })}
          </div>
        )} */}
      </div>
    </DomPopupContext.Provider>
  );
}
