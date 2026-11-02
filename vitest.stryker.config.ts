import { defineConfig } from "vitest/config";

// Minimal config for mutation testing: the simulation tests, no Vite plugins, and the tests outside src/sim that
// pin what the simulation's own tests leave to the golden tests, which need the original's files: the training
// wind through a jump, and the replay file read back and played through its input.
export default defineConfig({
  test: {
    include: [
      "src/sim/**/*.test.ts",
      "src/game/training-session.test.ts",
      "src/storage/original-replay-file.test.ts",
      "src/ui/original-replay-choice.test.ts",
    ],
  },
});
