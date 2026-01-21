import { vi } from "vitest";
import prismaMock from "./prismaMock";

// Global Prisma mock injection for every test
vi.mock("../../config/prisma.ts", () => ({
    default: prismaMock,
}));
