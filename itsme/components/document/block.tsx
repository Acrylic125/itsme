import { Text } from "react-konva";
import { DocumentStyles } from "./document-style-provider";

type Block =
  | {
      type: "about";
      header: string;
      points: string[];
    }
  | {
      type: "bullet-list";
      header: [string, string] | null;
      points: string[];
    }
  | {
      type: "2-column-list";
      header: [string, string] | null;
      points: [string, string][];
    }
  | {
      type: "v-spacer";
      height: number;
    };

type BlockWithSection =
  | Block
  | {
      type: "section";
      header: [string, string];
      blocks: Block[];
    };

export type DocRender<T> = {
  component: (props: {
    canvas: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    // children: DocRender[];
  }) => React.ReactElement;
};

function docRenderText() {
  return {
    component: () => <Text text="Hello" />,
    width: 0,
    height: 0,
  };
}

function docRenderGroup() {
  return {
    component: () => <Group />,
    width: 0,
    height: 0,
  };
}

// export type BaseBlockProps<T extends keyof DocumentStyles> = {
// };
