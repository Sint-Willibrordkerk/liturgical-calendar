import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // This checkout's own tests alone: a worktree under `.claude/` is another
    // copy of them, at another commit, and the pipeline's working folders hold
    // no tests.
    exclude: [...configDefaults.exclude, ".claude/**", ".divinum-officium/**"],
  },
});
