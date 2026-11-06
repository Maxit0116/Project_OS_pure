import { restoreAuthoritativeFixtures } from "../scripts/sample-fixture-reconciler";

/**
 * Many suites open `sample-graph-saas`, whose `.projectos` curated state is
 * git-ignored. Seed any missing files from the committed mirror before the run
 * so a fresh clone behaves like the developer machine, and say so loudly when
 * the local graph/tree has drifted from the mirror instead of letting a hundred
 * tests fail for an unexplained reason.
 */
export default function setup(): void {
  const result = restoreAuthoritativeFixtures();
  if (result.restored.length > 0) {
    console.warn(
      `[sample-fixtures] Seeded ${result.restored.length} missing file(s) in sample-graph-saas/.projectos from the committed mirror.`,
    );
  }
  if (result.divergent.length > 0) {
    console.warn(
      `[sample-fixtures] sample-graph-saas/.projectos/${result.divergent.join(", ")} differs from the committed mirror. ` +
        "Sample-dependent tests assume the mirror. Run `npm run fixtures:restore -- --force` to reset, " +
        "or `npm run fixtures:sync` if the edit is intentional.",
    );
  }
}
