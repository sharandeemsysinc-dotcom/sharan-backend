import { mockDeep, mockReset } from "vitest-mock-extended";
import { PrismaClient } from "@prisma/client";

export const prismaMock = mockDeep<PrismaClient>();

beforeEach(() => {
    mockReset(prismaMock);
});

export default prismaMock;
