import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/__visual/costeo");
  await expect(page.getByRole("heading", { name: "Costeo" })).toBeVisible();
  await expect(page.getByText("Sin vincular")).toHaveCount(0);
});

test("resumen dashboard is visually stable", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Costo por receta" })).toBeVisible();
  await expect(page.getByText("Visual Costeo Fixture.xlsx")).toBeVisible();
  await expect(page).toHaveScreenshot("costeo-resumen.png");
});

test("recetas cards and edit modal are visually stable", async ({ page }) => {
  await page.getByRole("button", { name: "Recetas" }).click();
  await expect(page.getByRole("heading", { name: "Recetas" })).toBeVisible();
  await expect(page.getByText("Chocolate Proteina")).toBeVisible();
  await expect(page).toHaveScreenshot("costeo-recetas.png");

  await page.getByRole("button", { name: /Chocolate Proteina/i }).first().click();
  await expect(page.getByText("Ingredientes de la receta")).toBeVisible();
  await expect(page).toHaveScreenshot("costeo-receta-modal.png");
});

test("ingredientes table and cost history modal are visually stable", async ({ page }) => {
  await page.getByRole("button", { name: "Ingredientes" }).click();
  await expect(page.getByRole("heading", { name: "Editar ingredientes" })).toBeVisible();
  const matchaInput = page.locator('input[value="Polvo de Matcha"]');
  await expect(matchaInput).toBeVisible();
  await expect(page).toHaveScreenshot("costeo-ingredientes.png");

  const matchaRow = page.getByRole("row").filter({ has: matchaInput });
  await matchaRow.getByRole("button", { name: "Historial" }).click();
  await expect(page.getByRole("heading", { name: "Historial de costo" })).toBeVisible();
  await expect(page.getByText("admin@plantivoro.test").first()).toBeVisible();
  await expect(page).toHaveScreenshot("costeo-ingrediente-historial-modal.png");
});

test("historial reports are visually stable", async ({ page }) => {
  await page.getByRole("button", { name: "Historial" }).click();
  await expect(page.getByRole("heading", { name: "Historial de costos" })).toBeVisible();
  await expect(page.getByText("Ingredientes que mas subieron")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Impacto estimado en recetas" })).toBeVisible();
  await expect(page).toHaveScreenshot("costeo-historial.png");
});
