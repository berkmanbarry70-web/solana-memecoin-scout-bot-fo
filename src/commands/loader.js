import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function registerCommands(bot) {
  const dir = path.dirname(fileURLToPath(import.meta.url));

  const commandFiles = fs
    .readdirSync(dir)
    .filter(
      (file) =>
        file.endsWith(".js") &&
        file !== "loader.js" &&
        !file.startsWith("_")
    );

  for (const file of commandFiles) {
    const full = path.join(dir, file);
    const mod = await import(pathToFileURL(full).href);

    const handler =
      (mod && (mod.default || mod.register)) ||
      (typeof mod === "function" ? mod : null);

    if (typeof handler === "function") {
      await handler(bot);
    } else {
      console.warn("[commands] skipped", { file });
    }
  }
}
