
// import fs from "fs";
// import path from "path";
// import { execSync } from "child_process";

// const prismaPath = path.join(process.cwd(), "prisma");
// const headerPath = path.join(prismaPath, "header.prisma");
// const modelsPath = path.join(prismaPath, "models");
// const schemaPath = path.join(prismaPath, "schema.prisma");

// // Read header.prisma (datasource + generator)
// const header = fs.readFileSync(headerPath, "utf8");

// // Combine all model files inside prisma/models/
// const modelFiles = fs.readdirSync(modelsPath);
// let models = "";

// for (const file of modelFiles) {
//     if (file.endsWith(".prisma")) {
//         const content = fs.readFileSync(path.join(modelsPath, file), "utf8");
//         models += "\n\n" + content;
//     }
// }

// // Write the final schema.prisma file
// const finalSchema = header + "\n\n" + models.trim();
// fs.writeFileSync(schemaPath, finalSchema);

// console.info("Merged all model files into prisma/schema.prisma");

// // Automatically generate Prisma client
// try {
//     console.info("Generating Prisma client...");
//     execSync("npx prisma generate", { stdio: "inherit" });
//     console.info("Prisma client generated successfully.");
// } catch (error) {
//     console.error("Failed to generate Prisma client:", error.message);
// }

// // Automatically push schema changes to the database
// try {
//     console.info("Pushing schema changes to database...");
//     execSync("npx prisma db push", { stdio: "inherit" });
//     console.info("Database schema synced successfully.");
// } catch (error) {
//     console.error("Failed to push schema changes to database:", error.message);
// }

// console.info("Prisma schema merge, generate, and sync completed successfully!");

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

console.info("🔄 Prisma Sync Started...");

// Ensure schema.prisma exists
const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");

if (!fs.existsSync(schemaPath)) {
    console.error("❌ ERROR: prisma/schema.prisma not found!");
    process.exit(1);
}

// Show first 50 lines of schema
const schemaPreview = fs.readFileSync(schemaPath, "utf8");
console.info("📄 Loaded schema.prisma");
console.info("-------------------------------------");
console.info(schemaPreview.split("\n").slice(0, 50).join("\n"));
console.info("-------------------------------------");

// Generate Prisma Client
try {
    console.info("⚙️ Running: npx prisma generate");
    execSync("npx prisma generate", { stdio: "inherit" });
    console.info("✅ Prisma client generated successfully.");
} catch (err) {
    console.error("❌ Failed to generate Prisma client:");
    console.error(err.message);
    process.exit(1);
}

// OPTIONAL — Push schema to DB (disabled for safety)
// Uncomment ONLY when schema is correct:
// try {
//     console.info("📤 Pushing schema to DB...");
//     execSync("npx prisma db push", { stdio: "inherit" });
//     console.info("✅ Database schema synced.");
// } catch (err) {
//     console.error("❌ Failed to sync schema to DB:");
//     console.error(err.message);
// }

console.info("🎉 Prisma Sync Completed Successfully!");
