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
    };

type BlockWithSection =
  | Block
  | {
      type: "section";
      header: [string, string];
      blocks: Block[];
    };

type TextStyle = {
  fontSize: number;
  fontWeight: "normal" | "bold";
};

type Document = {
  name: string;
  size: {
    width: number;
    height: number;
  };
  font: "Times New Roman";
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  textStyles: {
    default: TextStyle;
    h1: TextStyle;
    h2: TextStyle;
    h3: TextStyle;
    h4: TextStyle;
  };
  bulletListStyle: {
    bullet: string;
    indent: number;
    gap: number;
  };
  blocks: BlockWithSection[];
};

const DEFAULT_TEXT_STYLES: Document["textStyles"] = {
  default: {
    fontSize: 11,
    fontWeight: "normal",
  },
  h1: {
    fontSize: 16,
    fontWeight: "bold",
  },
  h2: {
    fontSize: 14,
    fontWeight: "bold",
  },
  h3: {
    fontSize: 12,
    fontWeight: "bold",
  },
  h4: {
    fontSize: 11,
    fontWeight: "bold",
  },
};

export const SAMPLE_RESUME: Document = {
  name: "Master Resume",
  textStyles: DEFAULT_TEXT_STYLES,
  size: {
    // US Letter size 8.5 x 11 inches
    width: 816,
    height: 1056,
  },
  bulletListStyle: {
    bullet: "•",
    indent: 10,
    gap: 10,
  },
  font: "Times New Roman",
  margins: {
    top: 10,
    bottom: 10,
    left: 10,
    right: 10,
  },
  blocks: [
    {
      type: "about",
      header: "John Doe",
      points: [
        "Software Engineer",
        "Full Stack Developer",
        "Github",
        "LinkedIn",
      ],
    },
    {
      type: "section",
      header: ["Education", ""],
      blocks: [
        {
          type: "2-column-list",
          header: null,
          points: [
            [
              "Nanyang Technological University | Bachelor's of Computing | cGPA 4.53",
              "August 2024 - Dec 2027",
            ],
          ],
        },
      ],
    },
    {
      type: "section",
      header: ["Experience", ""],
      blocks: [
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
      ],
    },
    {
      type: "section",
      header: ["Projects", ""],
      blocks: [
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
      ],
    },
    {
      type: "section",
      header: ["Achievements", ""],
      blocks: [
        {
          type: "2-column-list",
          header: null,
          points: [
            ["ASDF, ASDF", "Jan 2026 - Present"],
            ["ASDF, ASDF", "Jan 2026 - Present"],
            ["ASDF, ASDF", "Jan 2026 - Present"],
            ["ASDF, ASDF", "Jan 2026 - Present"],
          ],
        },
      ],
    },
  ],
};
