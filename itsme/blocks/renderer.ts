import z from "zod";
import { BlockSchema, StyleSheetSchema } from "./blocks";
import { BlockRendererContext } from "./renderer-types";
import { SectionBlockRenderer } from "./section/renderer";
import { ColumnsBlockRenderer } from "./columns/renderer";
import { TextBlockRenderer } from "./text/renderer";
import { ListBlockRenderer } from "./list/renderer";

const DEFAULT_STYLE_SHEET: z.infer<typeof StyleSheetSchema> = {
  page: {
    gap: 0.3,
    margins: {
      top: 0.3,
      bottom: 0.3,
      left: 0.3,
      right: 0.3,
    },
  },
  text: {
    default: {
      fontSize: 11,
      fontWeight: "normal",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
    h1: {
      fontSize: 16,
      fontWeight: "normal",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
    h2: {
      fontSize: 14,
      fontWeight: "bold",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
    h3: {
      fontSize: 12,
      fontWeight: "bold",
      fontFamily: "Times New Roman",
      lineHeight: 1.2,
    },
  },
  list: {
    /** Bullet column width (inches). */
    leftSpace: 0.35,
    /** Gap between bullet column and list body (inches). */
    rightSpace: 0.12,
  },
};

export const DocumentSchema = z.object({
  name: z.string(),
  pageSize: z.object({
    width: z.number(),
    height: z.number(),
  }),
  styleSheet: StyleSheetSchema,
  blocks: z.array(BlockSchema),
  layout: z.array(z.string()),
});

export const SAMPLE_DOCUMENT: z.infer<typeof DocumentSchema> = {
  name: "Sample Document",
  pageSize: {
    width: 8.5,
    height: 11,
  },
  styleSheet: DEFAULT_STYLE_SHEET,
  blocks: [
    {
      type: "section",
      id: "section-1",
      blocks: ["text-1", "text-2", "text-19", "text-20"],
    },
    {
      type: "text",
      id: "text-1",
      text: "John Doe",
      style: "h1",
      align: "center",
    },
    {
      type: "text",
      id: "text-2",
      text: "Software Engineer | +65 9123 4567 | Linkedin | Github",
      style: "h2",
      align: "center",
    },
    {
      type: "text",
      id: "text-19",
      text: "Distributed systems · Platform engineering · Mentorship · Occasionally on-call · Ex-university teaching assistant for advanced algorithms and concurrency",
      style: "default",
      align: "center",
    },
    {
      type: "text",
      id: "text-20",
      text: "Portfolio: https://example.com/johndoe/portfolio/v2/dashboard/index.html?tab=projects&utm_source=resume&ref=linkedin | Blog: https://blog.example.com/posts/2025/11/on-call-runbooks-and-incident-response-with-slos-and-error-budget-policy-design-patterns | GitHub: https://github.com/johndoe?tab=repositories&q=stars | Scholar: https://scholar.google.com/citations?user=ABCDEFGHIJK | Email: john.doe.software.engineering+singapore+resume@very-long-subdomain-mail-service.example.com",
      style: "default",
      align: "center",
    },
    {
      type: "section",
      id: "section-2",
      blocks: [
        "text-3",
        "columns-1",
        "text-edu-body",
        "columns-4",
        "text-exchange",
      ],
    },
    {
      type: "text",
      id: "text-3",
      text: "Education",
      style: "h2",
      align: "left",
    },
    {
      type: "columns",
      id: "columns-1",
      blocks: [
        {
          span: 2,
          blockId: "text-4",
        },
        {
          span: 1,
          blockId: "text-5",
        },
      ],
    },
    {
      type: "text",
      id: "text-4",
      text: "Nanyang Technological University | Bachelor of Computing in Computer Science | cGPA 4.53",
      style: "h3",
      align: "left",
    },
    {
      type: "text",
      id: "text-5",
      text: "Aug 2024 – Dec 2027",
      style: "h3",
      align: "right",
    },
    {
      type: "text",
      id: "text-edu-body",
      text: "Dean’s List (three consecutive semesters). Coursework highlights: CS3230 Design and Analysis of Algorithms; CS3210 Parallel Computing; CS4226 Internet-of-Things Systems; CS4246 AI for Interactive Media; CS2103T Software Engineering with team project spanning requirements, design docs, UML, CI/CD, and user testing with 40+ participants. Capstone: collaborated with industry partner on a regulated-data pipeline using event sourcing, idempotent consumers, exactly-once semantics discussion (trades-offs documented in a 45-page report), and load tests up to 50k events/minute in staging. Teaching: peer tutor for discrete math and data structures with 120+ cumulative contact hours; received commendation for clarity and preparedness. Teaching: peer tutor for discrete math and data structures with 120+ cumulative contact hours; received commendation for clarity and preparedness. Teaching: peer tutor for discrete math and data structures with 120+ cumulative contact hours; received commendation for clarity and preparedness.",
      style: "default",
      align: "left",
    },
    {
      type: "columns",
      id: "columns-4",
      blocks: [
        { span: 2, blockId: "text-21" },
        { span: 1, blockId: "text-22" },
      ],
    },
    {
      type: "text",
      id: "text-21",
      text: "Exchange semester | ETH Zürich | Focus on systems + compilers track | Notable: Advanced Topics in Operating Systems, Program Analysis, Computer Graphics with physically-based shading pipeline implemented in C++ and GLSL with extensive debugging of numerical precision issues and cross-platform build tooling using CMake presets and vcpkg for dependency vendoring with reproducible lockfiles",
      style: "h3",
      align: "left",
    },
    {
      type: "text",
      id: "text-22",
      text: "Jan 2026 – Jun 2026",
      style: "h3",
      align: "right",
    },
    {
      type: "text",
      id: "text-exchange",
      text: "ETH exchange narrative (repeat deliberately to stress-wrap): Built a toy compiler front-end (lexer/parser) and a small SSA-based optimization pass with dominance analysis; profiled register allocation behavior and wrote a long-form appendix comparing linear scan vs graph coloring under varying register pressure. ETH exchange narrative (repeat deliberately to stress-wrap): Built a toy compiler front-end (lexer/parser) and a small SSA-based optimization pass with dominance analysis; profiled register allocation behavior and wrote a long-form appendix comparing linear scan vs graph coloring under varying register pressure. ETH exchange narrative (repeat deliberately to stress-wrap): Built a toy compiler front-end (lexer/parser) and a small SSA-based optimization pass with dominance analysis; profiled register allocation behavior and wrote a long-form appendix comparing linear scan vs graph coloring under varying register pressure. Clubs: competitive programming contest training (weekly), board-game design society (treasurer), and intramural futsal (substitute captain when roster allowed).",
      style: "default",
      align: "left",
    },
    {
      type: "section",
      id: "section-3",
      blocks: [
        "text-6",
        "columns-2",
        "text-10",
        "columns-3",
        "text-13",
        "columns-5",
        "text-29",
        "columns-6",
        "text-32",
      ],
    },
    {
      type: "text",
      id: "text-6",
      text: "Work Experience",
      style: "h2",
      align: "left",
    },
    {
      type: "columns",
      id: "columns-2",
      blocks: [
        { span: 2, blockId: "text-8" },
        { span: 1, blockId: "text-9" },
      ],
    },
    {
      type: "text",
      id: "text-8",
      text: "Senior Software Engineer | Acme Corp | Singapore",
      style: "h3",
      align: "left",
    },
    {
      type: "text",
      id: "text-9",
      text: "Jan 2022 – Present",
      style: "h3",
      align: "right",
    },
    {
      type: "text",
      id: "text-10",
      text: "Led design and delivery of customer-facing APIs; improved p95 latency by 40%. Mentored two junior engineers and drove code review standards across the team. Owned the API gateway migration (Kong → Envoy in phases), including canary traffic shaping, header normalization, WAF rule parity reviews, and post-incident retros that fed into shared runbooks; coordinated with InfoSec for quarterly pen-tests and remediated findings within SLA; wrote internal RFCs for rate-limit policy (token bucket vs leaky bucket) with math-heavy appendices nobody reads but everyone links in meetings. Led design and delivery of customer-facing APIs; improved p95 latency by 40%. Mentored two junior engineers and drove code review standards across the team. Owned the API gateway migration (Kong → Envoy in phases), including canary traffic shaping, header normalization, WAF rule parity reviews, and post-incident retros that fed into shared runbooks; coordinated with InfoSec for quarterly pen-tests and remediated findings within SLA; wrote internal RFCs for rate-limit policy (token bucket vs leaky bucket) with math-heavy appendices nobody reads but everyone links in meetings.",
      style: "default",
      align: "left",
    },
    {
      type: "columns",
      id: "columns-3",
      blocks: [
        { span: 2, blockId: "text-11" },
        { span: 1, blockId: "text-12" },
      ],
    },
    {
      type: "text",
      id: "text-11",
      text: "Software Engineer | Beta Labs | Remote",
      style: "h3",
      align: "left",
    },
    {
      type: "text",
      id: "text-12",
      text: "Jun 2019 – Dec 2021",
      style: "h3",
      align: "right",
    },
    {
      type: "text",
      id: "text-13",
      text: "Shipped features on the payments team; owned onboarding flows end-to-end. Reduced support tickets by refining error states and validation messaging. Implemented idempotency keys, reconciliation jobs, payouts retries with exponential backoff + jitter, and dashboards in Grafana with SLO burn charts; collaborated with finance on ledger invariants and edge cases around public holidays and partial refunds; wrote extensive integration tests with recorded VCR-ish fixtures and contract tests against PSP sandbox quirks. Shipped features on the payments team; owned onboarding flows end-to-end. Reduced support tickets by refining error states and validation messaging. Implemented idempotency keys, reconciliation jobs, payouts retries with exponential backoff + jitter, and dashboards in Grafana with SLO burn charts; collaborated with finance on ledger invariants and edge cases around public holidays and partial refunds; wrote extensive integration tests with recorded VCR-ish fixtures and contract tests against PSP sandbox quirks.",
      style: "default",
      align: "left",
    },
    {
      type: "columns",
      id: "columns-5",
      blocks: [
        { span: 2, blockId: "text-27" },
        { span: 1, blockId: "text-28" },
      ],
    },
    {
      type: "text",
      id: "text-27",
      text: "Staff Engineer (contract-to-hire) | Gamma Systems | Singapore / Hybrid | Platform observability + reliability | Stack overlap: Go services, Kafka, OTel, Tempo, Prometheus, Thanos, Kubernetes, Argo CD, Vault, Terraform, custom SLO framework adopted org-wide after a six-month pilot that included executive steering reviews and a rotating on-call lottery nobody enjoyed but everyone pretended was fair",
      style: "h3",
      align: "left",
    },
    {
      type: "text",
      id: "text-28",
      text: "Mar 2018 – Dec 2021",
      style: "h3",
      align: "right",
    },
    {
      type: "text",
      id: "text-29",
      text: "Ran multi-quarter reliability program: error budget policy, incident command rotations, blameless postmortems, action-item tracking to completion (yes, actually completing them), and a documentation sprint that produced thousands of pages of runbooks that engineers still Ctrl+F through at 3am. Instrumented critical paths with exemplars and trace-tail sampling to balance cost vs signal; worked with vendor support when trace volume spikes threatened monthly invoices; negotiated sampling strategies with finance-ish stakeholders using percentile math and “risk dollars” framing. Ran multi-quarter reliability program: error budget policy, incident command rotations, blameless postmortems, action-item tracking to completion (yes, actually completing them), and a documentation sprint that produced thousands of pages of runbooks that engineers still Ctrl+F through at 3am. Instrumented critical paths with exemplars and trace-tail sampling to balance cost vs signal; worked with vendor support when trace volume spikes threatened monthly invoices; negotiated sampling strategies with finance-ish stakeholders using percentile math and “risk dollars” framing. Ran multi-quarter reliability program: error budget policy, incident command rotations, blameless postmortems, action-item tracking to completion (yes, actually completing them), and a documentation sprint that produced thousands of pages of runbooks that engineers still Ctrl+F through at 3am.",
      style: "default",
      align: "left",
    },
    {
      type: "columns",
      id: "columns-6",
      blocks: [
        { span: 2, blockId: "text-30" },
        { span: 1, blockId: "text-31" },
      ],
    },
    {
      type: "text",
      id: "text-30",
      text: "Intern → Junior SWE | Delta Startup Studio | On-site | Product engineering for early-stage B2B SaaS with a microservices monorepo that accidentally became a monolith that accidentally became microservices again after leadership changes and three rebrands",
      style: "h3",
      align: "left",
    },
    {
      type: "text",
      id: "text-31",
      text: "May 2016 – Feb 2018",
      style: "h3",
      align: "right",
    },
    {
      type: "text",
      id: "text-32",
      text: "EXTREME-LENGTH BULLET SIMULATION: Shipped CSV importers with schema evolution, backfills, feature flags, dark launch toggles, and progressive rollout; paired with designers on empty states and loading skeletons; paired with legal on data retention; paired with sales on edge-case demos; fixed race conditions in websocket fanout; reduced flaky tests from “comedy hour” to “occasional sigh” by investing in deterministic clocks, fake timers, hermetic testcontainers, and a shared test data factory that became its own mini-product with versioning, deprecation warnings, and migration guides for tests referencing deprecated fixtures; wrote ADRs; deleted ADRs; resurrected ADRs as “living documents” nobody updates; wrote bash one-liners that became permanent infrastructure; replaced bash one-liners with Python scripts; replaced Python scripts with Go CLIs; replaced Go CLIs with a web UI that nobody used; deleted the web UI and went back to Go CLIs; celebrated velocity. EXTREME-LENGTH BULLET SIMULATION: Shipped CSV importers with schema evolution, backfills, feature flags, dark launch toggles, and progressive rollout; paired with designers on empty states and loading skeletons; paired with legal on data retention; paired with sales on edge-case demos; fixed race conditions in websocket fanout; reduced flaky tests from “comedy hour” to “occasional sigh” by investing in deterministic clocks, fake timers, hermetic testcontainers, and a shared test data factory that became its own mini-product with versioning, deprecation warnings, and migration guides for tests referencing deprecated fixtures; wrote ADRs; deleted ADRs; resurrected ADRs as “living documents” nobody updates; wrote bash one-liners that became permanent infrastructure; replaced bash one-liners with Python scripts; replaced Python scripts with Go CLIs; replaced Go CLIs with a web UI that nobody used; deleted the web UI and went back to Go CLIs; celebrated velocity.",
      style: "default",
      align: "left",
    },
    {
      type: "section",
      id: "section-4",
      blocks: ["text-7", "text-14", "text-33", "text-34"],
    },
    {
      type: "text",
      id: "text-7",
      text: "Skills",
      style: "h2",
      align: "left",
    },
    {
      type: "text",
      id: "text-14",
      text: "TypeScript, React, Node.js, PostgreSQL, Docker, AWS (ECS, S3), GraphQL, Git",
      style: "default",
      align: "left",
    },
    {
      type: "text",
      id: "text-33",
      text: "Languages & runtimes: TypeScript/JavaScript (ESM/CJS interop scars), Go, Rust (hobby-grade), Python (data + tooling), Bash (productionized regrets), SQL (Postgres-specific features: CTEs, window functions, partial indexes, exclusion constraints), GraphQL (schema stitching pitfalls), HTML/CSS (layout debugging at 1am). Frameworks: Next.js App Router, React Server Components boundaries, TanStack Query, Zustand, Express/Fastify, NestJS modules, Prisma/Drizzle migrations discipline. Infra: Kubernetes basics-to-medium, Helm, Argo CD, Terraform/OpenTofu, Docker multi-stage builds, BuildKit cache strategies, GitHub Actions + self-hosted runners, OIDC hardening stories nobody wants in a dinner party. Data: Kafka fundamentals, consumer groups, idempotent writes, outbox pattern, CQRS-ish experiments, Redis (caching + rate limits), Elasticsearch queries that started innocent.",
      style: "default",
      align: "left",
    },
    {
      type: "text",
      id: "text-34",
      text: "Soft skills / practices: code review with empathy but firmness, incident facilitation, writing crisp async updates during outages, mentoring interns through ambiguous projects, translating between eng/product/design/legal, estimation that acknowledges unknown-unknowns without sounding evasive, facilitation of architecture discussions with whiteboards that look like modern art, reading postgres logs for sport, and maintaining sense of humor when CI turns red on a Friday because someone merged a lockfile conflict that only breaks on Linux runners in a timezone you do not inhabit.",
      style: "default",
      align: "left",
    },
    {
      type: "section",
      id: "section-5",
      blocks: ["text-15", "text-16", "list-1", "text-35", "text-36"],
    },
    {
      type: "text",
      id: "text-15",
      text: "Projects",
      style: "h2",
      align: "left",
    },
    {
      type: "text",
      id: "text-16",
      text: "Resume builder (2025) — Next.js + Konva canvas editor with block-based layout and PDF export. Open-source CLI for theme tokens.",
      style: "default",
      align: "left",
    },
    {
      type: "list",
      id: "list-1",
      bullet: {
        type: "alphabetical",
      },
      blocks: ["text-38", "text-39", "text-40"],
    },
    {
      type: "text",
      id: "text-38",
      text: "Built a design-system playground that renders components against multiple themes, locales, viewport presets, and mocked API states so visual regressions show up before launch instead of during a customer demo.",
      style: "default",
      align: "left",
    },
    {
      type: "text",
      id: "text-39",
      text: "Created an internal release assistant that aggregates changelog fragments, validates semantic version bumps, checks migration guide presence, and generates release notes in a tone that sounds much more organized than the week that actually produced the release.",
      style: "default",
      align: "left",
    },
    {
      type: "text",
      id: "text-40",
      text: "Extreme wrap case for the new list renderer: designed a migration planner that compares old and new schema graphs, highlights incompatible field transitions, simulates phased backfills, estimates lock contention risk, and emits a step-by-step rollout plan with preflight checks, canary thresholds, rollback triggers, dashboards to watch, and a post-deploy verification checklist that keeps going long after everyone in the room wishes the sentence had already ended.",
      style: "default",
      align: "left",
    },
    {
      type: "text",
      id: "text-35",
      text: "Personal knowledge graph (2024–2025) — SQLite + FTS5 + custom ranking + nightly ingestion jobs from RSS/read-later exports; TUI for fast capture; web UI for graph exploration with force-directed layouts that oscillate until you question your life choices; includes property graph modeling, conflict resolution when the same URL is saved under multiple titles, and migration scripts that print comforting progress bars; tests include snapshot-ish fixtures and fuzz-ish inputs for parsers; license: MIT; stars: aspirational; issues: plentiful; README: overconfident.",
      style: "default",
      align: "left",
    },
    {
      type: "text",
      id: "text-36",
      text: "Community / OSS maint (misc) — triage issues, reproduce bugs on Windows/Linux, chase semver breakage in transitive dependencies, write changelog entries that read like therapy, automate releases with provenance and SBOM generation steps that CI occasionally fails because someone bumped openssl and the world shifted slightly on its axis, and occasionally answer discussions with Stack Overflow-grade thoroughness while secretly hoping the thread ends.",
      style: "default",
      align: "left",
    },
    {
      type: "section",
      id: "section-6",
      blocks: ["text-17", "text-18", "text-37"],
    },
    {
      type: "text",
      id: "text-17",
      text: "Languages & interests",
      style: "h2",
      align: "left",
    },
    {
      type: "text",
      id: "text-18",
      text: "English (native), Mandarin (conversational). Interests: running, coffee roasting, OSS.",
      style: "default",
      align: "left",
    },
    {
      type: "text",
      id: "text-37",
      text: "Interests expanded (stress test): ultramarathon training spreadsheets with heart-rate zones and carbohydrate timing; espresso puck analysis with a microscope (briefly); sourdough timeline optimization; chess puzzles; indie game jams; board games with rules disputes; reading about urban planning, transit, and why your train is late; listening to technical podcasts at 1.25× while doing chores; volunteering at weekend coding workshops for students; mentoring early-career engineers through salary negotiation framing without making promises; collecting mechanical keyboards until shelf capacity staged an intervention; learning to say no to new side projects and failing weekly; writing overly detailed trip itineraries that nobody follows; and maintaining a notes inbox with 12,000 entries titled “TODO: organize notes”. Interests expanded (stress test): ultramarathon training spreadsheets with heart-rate zones and carbohydrate timing; espresso puck analysis with a microscope (briefly); sourdough timeline optimization; chess puzzles; indie game jams; board games with rules disputes; reading about urban planning, transit, and why your train is late; listening to technical podcasts at 1.25× while doing chores; volunteering at weekend coding workshops for students; mentoring early-career engineers through salary negotiation framing without making promises; collecting mechanical keyboards until shelf capacity staged an intervention; learning to say no to new side projects and failing weekly; writing overly detailed trip itineraries that nobody follows; and maintaining a notes inbox with 12,000 entries titled “TODO: organize notes”.",
      style: "default",
      align: "left",
    },
  ],
  layout: [
    "section-1",
    "section-2",
    "section-3",
    "section-4",
    "section-5",
    "section-6",
  ],
};

/** Page box, margins, and stride (`pageHeight + gap`) in CSS pixels at `dpi`. */
export function getPageLayoutMetrics(
  document: z.infer<typeof DocumentSchema>,
  dpi: number
) {
  const pageWidthPx = document.pageSize.width * dpi;
  const pageHeightPx = document.pageSize.height * dpi;
  const gapPx = document.styleSheet.page.gap * dpi;
  const pageStridePx = pageHeightPx + gapPx;
  const marginTopPx = document.styleSheet.page.margins.top * dpi;
  const marginBottomPx = document.styleSheet.page.margins.bottom * dpi;
  const marginLeftPx = document.styleSheet.page.margins.left * dpi;
  const marginRightPx = document.styleSheet.page.margins.right * dpi;
  const contentWidthPx = pageWidthPx - marginLeftPx - marginRightPx;
  return {
    pageWidthPx,
    pageHeightPx,
    gapPx,
    pageStridePx,
    marginTopPx,
    marginBottomPx,
    marginLeftPx,
    marginRightPx,
    contentWidthPx,
  };
}

export function createContext(
  document: z.infer<typeof DocumentSchema>,
  dpi: number
): BlockRendererContext {
  const {
    pageHeightPx,
    pageStridePx,
    marginTopPx,
    marginBottomPx,
    marginLeftPx,
  } = getPageLayoutMetrics(document, dpi);
  let nextPosition = {
    x: marginLeftPx,
    y: marginTopPx,
  };
  const usableHeightPerPage = pageHeightPx - marginTopPx - marginBottomPx;
  //   const renderers = [
  //     SectionBlockRenderer,
  //     TextBlockRenderer,
  //     ColumnsBlockRenderer,
  //   ] satisfies BlockRendererMap;
  return {
    styleSheet: document.styleSheet,
    dpi,
    getNextPosition: () => {
      return {
        ...nextPosition,
      };
    },
    setNextPosition: (pos) => {
      nextPosition = pos;
    },
    claimBlockSpace: (height: number) => {
      const blockHeight = Math.max(0, height);
      const currentX = nextPosition.x;
      const currentPageIndex = Math.floor(nextPosition.y / pageStridePx);
      let pageTop = currentPageIndex * pageStridePx;
      let contentTop = pageTop + marginTopPx;
      let contentBottom = contentTop + usableHeightPerPage;

      if (nextPosition.y < contentTop) {
        nextPosition = { x: currentX, y: contentTop };
      }

      // Move whole block to next page if it doesn't fit current page content box.
      if (nextPosition.y + blockHeight > contentBottom) {
        pageTop += pageStridePx;
        contentTop = pageTop + marginTopPx;
        contentBottom = contentTop + usableHeightPerPage;
        nextPosition = { x: currentX, y: contentTop };
      }

      // Clamp extreme oversize blocks into current page bounds.
      if (nextPosition.y + blockHeight > contentBottom) {
        nextPosition = { x: currentX, y: contentBottom - blockHeight };
      }

      const from = { x: currentX, y: nextPosition.y };
      const to = {
        x: currentX,
        y: nextPosition.y + blockHeight,
      };

      nextPosition = { x: currentX, y: to.y };
      return {
        canvas: {
          from,
          to,
        },
      };
    },
    allBlocks: document.blocks,
    renderers: {
      section: SectionBlockRenderer,
      text: TextBlockRenderer,
      columns: ColumnsBlockRenderer,
      list: ListBlockRenderer,
    },
    // renderers: [
    //   SectionBlockRenderer,
    //   TextBlockRenderer,
    //   ColumnsBlockRenderer,
    // ] satisfies BlockRendererContext["renderers"],
  };
}

export type RenderedLayoutBlock = {
  id: string;
  y: number;
  /** Vertical extent in document px (same space as `y`); used for pagination / canvas. */
  height: number;
  component: () => React.ReactNode;
};

export function renderDocumentLayout(args: {
  document: z.infer<typeof DocumentSchema>;
  dpi: number;
}): RenderedLayoutBlock[] {
  const { document, dpi } = args;
  const ctx = createContext(document, dpi);
  const { contentWidthPx } = getPageLayoutMetrics(document, dpi);
  const byId = new Map(document.blocks.map((block) => [block.id, block]));
  const rendered: RenderedLayoutBlock[] = [];

  for (const blockId of document.layout) {
    const block = byId.get(blockId);
    if (!block) continue;
    const renderer = ctx.renderers[block.type];
    if (!renderer) continue;
    const start = ctx.getNextPosition();
    const result = (
      renderer.render as (
        block: z.infer<typeof BlockSchema>,
        relativeTo: { x: number; y: number; width: number },
        ctx: BlockRendererContext
      ) => {
        estimatedDimensions: { width: number; height: number };
        component: () => React.ReactNode;
      }
    )(block, { x: 0, y: 0, width: contentWidthPx }, ctx);
    rendered.push({
      id: block.id,
      y: start.y,
      height: result.estimatedDimensions.height,
      component: result.component,
    });
  }

  return rendered;
}
