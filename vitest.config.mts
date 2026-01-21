import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
        setupFiles: ["src/tests/setup.ts", "src/tests/setup/globalSetup.ts"],
        clearMocks: true,
    },
});
