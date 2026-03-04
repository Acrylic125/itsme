import { createContext, useContext } from "react";

type TextStyle = {
  fontSize: number;
  fontWeight: "normal" | "bold";
  lineHeight: number;
};

export type DocumentStyles = {
  dpi: number;
  pageSize: {
    /**
     * US Letter is 8.5 x 11 (inches)
     */
    width: number;
    height: number;
  };
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  bulletListStyle: {
    bullet: string;
    indent: number;
    gap: number;
  };
  font: "Times New Roman";
  textStyles: {
    default: TextStyle;
    h1: TextStyle;
    h2: TextStyle;
    h3: TextStyle;
    h4: TextStyle;
  };
};

const DEFAULT_DPI = 300;

export function inchToPx(inches: number) {
  return inches * 96;
}

export function ptToPx(pt: number) {
  return (pt * 96) / 72;
}

export function createDefaultStyles() {
  return {
    dpi: DEFAULT_DPI,
    pageSize: {
      width: 8.5,
      height: 11,
    },
    margins: {
      top: 24,
      bottom: 24,
      left: 24,
      right: 24,
    },
    bulletListStyle: {
      bullet: "•",
      indent: 11,
      gap: 11,
    },
    font: "Times New Roman",
    textStyles: {
      default: {
        fontSize: 11,
        fontWeight: "normal",
        lineHeight: 1.2,
      },
      h1: {
        fontSize: 16,
        fontWeight: "normal",
        lineHeight: 1.2,
      },
      h2: {
        fontSize: 14,
        fontWeight: "bold",
        lineHeight: 1.2,
      },
      h3: {
        fontSize: 12,
        fontWeight: "bold",
        lineHeight: 1.2,
      },
      h4: {
        fontSize: 11,
        fontWeight: "bold",
        lineHeight: 1.2,
      },
    },
  } satisfies DocumentStyles;
}

const DocumentStylesContext = createContext<DocumentStyles>(
  createDefaultStyles()
);

export function DocumentStyleProvider({
  children,
  styles,
}: {
  children: React.ReactNode;
  styles: DocumentStyles;
}) {
  return (
    <DocumentStylesContext.Provider value={styles}>
      {children}
    </DocumentStylesContext.Provider>
  );
}

export function useDocumentStyles() {
  return useContext(DocumentStylesContext);
}
