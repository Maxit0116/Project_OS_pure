import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const sampleRoot = resolve("..", "sample-graph-saas");
const requireFromSample = createRequire(join(sampleRoot, "package.json"));
const babel = requireFromSample("next/dist/compiled/babel/core") as {
  transformSync(
    source: string,
    options: Record<string, unknown>,
  ): { code?: string | null } | null;
};
const nextBabel = requireFromSample("next/babel") as unknown;
const sourceBindingPlugin = requireFromSample(
  join(sampleRoot, "tools/projectos-source-binding-babel-plugin.cjs"),
) as unknown;
const previewSalt = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const temporaryRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("sample source-binding Babel plugin", () => {
  it("skips a macro-generated JSX node without source offsets instead of aborting compilation", () => {
    const insertSyntheticJsx = ({ types: t }: { types: any }) => ({
      visitor: {
        Program(path: { pushContainer(key: string, node: unknown): void }) {
          const element = t.jsxElement(
            t.jsxOpeningElement(
              t.jsxIdentifier("div"),
              [
                t.jsxAttribute(
                  t.jsxIdentifier("style"),
                  t.jsxExpressionContainer(t.objectExpression([
                    t.objectProperty(t.identifier("color"), t.stringLiteral("red")),
                  ])),
                ),
              ],
              true,
            ),
            null,
            [],
            true,
          );
          path.pushContainer("body", t.expressionStatement(element));
        },
      },
    });

    const output = withPreviewSalt(() => babel.transformSync(
      "export const value = 1",
      {
        filename: join(sampleRoot, "synthetic-offsetless.tsx"),
        cwd: sampleRoot,
        presets: [nextBabel],
        plugins: [insertSyntheticJsx, sourceBindingPlugin],
        configFile: false,
        babelrc: false,
      },
    )?.code ?? "");

    expect(output).toContain("color");
    expect(output).not.toContain("data-projectos-source-id");
  });

  it("binds a named-imported local component when its root can consume the callsite id", () => {
    const root = createSourceBindingFixture({
      "components/Foo.tsx": [
        "export function Foo({ label }: { label: string }) {",
        "  return <section style={{ padding: 8 }}>{label}</section>",
        "}",
      ].join("\n"),
      "page.tsx": [
        "import { Foo } from './components/Foo'",
        "export default function Page() {",
        "  return <Foo label=\"named\" />",
        "}",
      ].join("\n"),
    });

    const caller = transform(root, "page.tsx");
    const component = transform(root, "components/Foo.tsx");

    expect(caller).toMatch(/__projectosCallsiteSourceId:\s*["']ps1_c_/u);
    expect(component).toContain("data-projectos-callsite-source-id");
    expect(component).toContain("__projectosCallsiteSourceId");
  });

  it("instruments every lowercase intrinsic without treating fragments or components as templates", () => {
    const root = createSourceBindingFixture({
      "Example.tsx": [
        "const attrs = { role: 'status' }",
        "const base = { color: '#112233' }",
        "function Card() { return <strong>card</strong> }",
        "export default function Example() {",
        "  return <>",
        "    <section>",
        "      <h2>Title</h2>",
        "      <input />",
        "      <svg><path /></svg>",
        "      <my-widget />",
        "      <aside {...attrs} />",
        "      <div style={{ ...base, padding: 8 }} />",
        "      <Card />",
        "    </section>",
        "  </>",
        "}",
      ].join("\n"),
    });

    const output = transform(root, "Example.tsx");
    const sourceIds = [...output.matchAll(/ps1_t_[A-Za-z0-9_-]{43}/gu)]
      .map((match) => match[0]);

    expect(sourceIds).toHaveLength(9);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(output).not.toContain("data-projectos-callsite-source-id");
  });

  it("preserves A1 callsite propagation when an alternate return adds an unstyled intrinsic", () => {
    const root = createSourceBindingFixture({
      "components/Mixed.tsx": [
        "export default function Mixed({ active }: { active: boolean }) {",
        "  if (active) return <section style={{ padding: 8 }}>active</section>",
        "  return <aside>inactive</aside>",
        "}",
      ].join("\n"),
      "page.tsx": [
        "import Mixed from './components/Mixed'",
        "export default function Page() { return <Mixed active /> }",
      ].join("\n"),
    });

    const caller = transform(root, "page.tsx");
    const component = transform(root, "components/Mixed.tsx");

    expect(caller).toMatch(/__projectosCallsiteSourceId:\s*["']ps1_c_/u);
    expect(component).toContain("data-projectos-callsite-source-id");
    expect(component.match(/ps1_t_[A-Za-z0-9_-]{43}/gu)).toHaveLength(2);
  });

  it("does not pass an unconsumed callsite prop to a component with an unsupported root", () => {
    const root = createSourceBindingFixture({
      "components/Unsafe.tsx": [
        "export default function Unsafe(props: Record<string, unknown>) {",
        "  return <><div {...props} style={{ color: 'red' }} /></>",
        "}",
      ].join("\n"),
      "page.tsx": [
        "import Unsafe from './components/Unsafe'",
        "export default function Page() {",
        "  return <Unsafe />",
        "}",
      ].join("\n"),
    });

    const caller = transform(root, "page.tsx");
    const component = transform(root, "components/Unsafe.tsx");

    expect(caller).not.toContain("__projectosCallsiteSourceId");
    expect(component).not.toContain("data-projectos-callsite-source-id");
  });
});

describe("sample application hardening", () => {
  it("keeps the ProjectOS dashboard design host dev-only and loader-free", () => {
    const route = readFileSync(
      join(sampleRoot, "app/dashboard/[projectosDesignHost]/page.tsx"),
      "utf8",
    );
    const client = readFileSync(
      join(sampleRoot, "app/dashboard/[projectosDesignHost]/DesignHostClient.tsx"),
      "utf8",
    );

    expect(route).toContain("process.env.NODE_ENV === 'production'");
    expect(route).toContain("props.params.projectosDesignHost !== DESIGN_HOST_SEGMENT");
    expect(route).toContain("const DESIGN_HOST_SEGMENT = '__projectos-design-host'");
    expect(route).toContain("notFound()");
    expect(route).toContain("DesignHostClient");
    expect(route).not.toContain("DashboardDesignView");
    expect(route).not.toContain("designHostViewModel");
    expect(route).not.toContain("loadDashboardViewModel");
    expect(route).not.toContain("@/projectos-blocks/loaders/dashboard");
    expect(route).not.toContain("@/lib/auth");
    expect(route).not.toContain("@/lib/data");

    expect(client).toContain("const SNAPSHOT_MESSAGE_TYPE = 'projectos:block-render-snapshot-v1'");
    expect(client).toContain("const READY_MESSAGE_TYPE = 'projectos:design-host-ready-v1'");
    expect(client).toContain("document.defaultView");
    expect(client).toContain("event.origin !== document.location.origin");
    expect(client).toContain("view.postMessage({ type: READY_MESSAGE_TYPE }, document.location.origin)");
    expect(client).toContain('data-projectos-render-source="blocks-snapshot"');
    expect(client).toContain("data-projectos-geometry-proof-sha256");
    expect(client).toContain("getBoundingClientRect()");
    expect(client).toContain("crypto.subtle.digest('SHA-256'");
    expect(client).toContain("snapshot.document.blocks");
    expect(client).toContain("snapshot.document.rootBlockId");
    expect(client).not.toContain("DashboardDesignView");
    expect(client).not.toContain("designHostViewModel");
    expect(client).not.toContain("loadDashboardViewModel");
    expect(client).not.toContain("@/projectos-blocks/loaders/dashboard");
    expect(client).not.toContain("@/lib/auth");
    expect(client).not.toContain("@/lib/data");
    expect(client).not.toContain("window.");
  });

  it("renders stored post content as escaped text rather than executable HTML", () => {
    const pageSource = readFileSync(
      join(sampleRoot, "app/blog/[slug]/page.tsx"),
      "utf8",
    );
    expect(pageSource).not.toContain("dangerouslySetInnerHTML");
    expect(pageSource).toContain("{post.content}");

    const React = requireFromSample("react") as {
      createElement(type: string, props: null, child: string): unknown;
    };
    const ReactDomServer = requireFromSample("react-dom/server") as {
      renderToStaticMarkup(element: unknown): string;
    };
    const payload = '<img src=x onerror="globalThis.pwned=true"><script>pwned()</script>';
    const rendered = ReactDomServer.renderToStaticMarkup(
      React.createElement("div", null, payload),
    );

    expect(rendered).not.toMatch(/<(?:img|script)\b/u);
    expect(rendered).toContain("&lt;script&gt;");
  });

  it("keeps plan selection server-owned and never presents it as a captured payment", () => {
    const route = readFileSync(
      join(sampleRoot, "app/api/checkout/route.ts"),
      "utf8",
    );
    const payments = readFileSync(join(sampleRoot, "lib/payments.ts"), "utf8");
    const checkoutForm = readFileSync(
      join(sampleRoot, "components/CheckoutForm.tsx"),
      "utf8",
    );

    expect(route).toContain("getRequestSession(request)");
    expect(route).not.toContain("getSession()");
    expect(route).not.toContain("validateToken");
    expect(route).not.toContain("paymentMethod");
    expect(payments).toContain("requireWorkspaceMembership");
    expect(payments).toContain("session.activeTeamId");
    expect(payments).toContain("db.$transaction");
    expect(payments).toContain("activityLog.create");
    expect(payments).toContain("paymentCaptured: false");
    expect(checkoutForm).toContain("No payment was processed.");
    expect(checkoutForm).toContain("result.paymentCaptured !== false");
    expect(checkoutForm).not.toContain("payment recorded");
    expect(checkoutForm).not.toContain("Confirm Payment");
    expect(checkoutForm).not.toContain("paymentMethod");
  });

  it.each([
    ["secret only", { secret: "s".repeat(43), context: undefined }],
    ["context only", { secret: undefined, context: "a".repeat(64) }],
  ])("disables preview health binding without throwing for a partial %s configuration", async (
    _name,
    values,
  ) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const headers = await withPreviewHealthEnvironment(values, async () => {
      const config = loadFreshNextConfig();
      return config.headers();
    });

    expect(headers).toEqual([]);
    expect(warning).toHaveBeenCalledWith(expect.stringMatching(/both.*required.*disabled/iu));
  });

  it("keeps the managed preview health proof enabled when both values are valid", async () => {
    const headers = await withPreviewHealthEnvironment({
      secret: "s".repeat(43),
      context: "a".repeat(64),
    }, async () => {
      const config = loadFreshNextConfig();
      return config.headers();
    });

    expect(headers).toHaveLength(1);
    expect(headers[0]).toMatchObject({
      source: "/:path*",
      headers: [{ key: "X-ProjectOS-Preview-Proof", value: expect.stringMatching(/^ph1_[A-Za-z0-9_-]{43}$/u) }],
    });
  });
});

function createSourceBindingFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "projectos-babel-hardening-"));
  temporaryRoots.push(root);
  for (const [filePath, content] of Object.entries(files)) {
    const target = join(root, filePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return root;
}

function transform(root: string, filePath: string): string {
  const absolutePath = join(root, filePath);
  return withPreviewSalt(() => babel.transformSync(
    readFileSync(absolutePath, "utf8"),
    {
      filename: absolutePath,
      cwd: root,
      presets: [nextBabel],
      plugins: [sourceBindingPlugin],
      configFile: false,
      babelrc: false,
    },
  )?.code ?? "");
}

function withPreviewSalt<T>(run: () => T): T {
  const previous = process.env["PROJECTOS_PREVIEW_SESSION_SALT"];
  process.env["PROJECTOS_PREVIEW_SESSION_SALT"] = previewSalt;
  try {
    return run();
  } finally {
    restoreEnvironment("PROJECTOS_PREVIEW_SESSION_SALT", previous);
  }
}

async function withPreviewHealthEnvironment<T>(
  values: { secret: string | undefined; context: string | undefined },
  run: () => Promise<T>,
): Promise<T> {
  const previousSecret = process.env["PROJECTOS_PREVIEW_HEALTH_SECRET"];
  const previousContext = process.env["PROJECTOS_PREVIEW_HEALTH_CONTEXT"];
  setOptionalEnvironment("PROJECTOS_PREVIEW_HEALTH_SECRET", values.secret);
  setOptionalEnvironment("PROJECTOS_PREVIEW_HEALTH_CONTEXT", values.context);
  try {
    return await run();
  } finally {
    restoreEnvironment("PROJECTOS_PREVIEW_HEALTH_SECRET", previousSecret);
    restoreEnvironment("PROJECTOS_PREVIEW_HEALTH_CONTEXT", previousContext);
  }
}

function loadFreshNextConfig(): {
  headers(): Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
} {
  const configPath = requireFromSample.resolve(join(sampleRoot, "next.config.js"));
  delete requireFromSample.cache[configPath];
  return requireFromSample(configPath) as {
    headers(): Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
  };
}

function setOptionalEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function restoreEnvironment(name: string, value: string | undefined): void {
  setOptionalEnvironment(name, value);
}
