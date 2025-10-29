import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fixtures";
const { Given, When, Then, Before, After } = createBdd(test);

Given('User is logged into cwp portal', async ({ loginPage }) => {
  console.log("Background step executed: User is logged into cwp portal");

  await loginPage.navigateToLoginPage('https://builderssa.honeywellforge.com/');
  await loginPage.login("h502736", "Test");
});

Given('user navigates to Create screen of {string} instances', async ({ }, arg) => {
  console.log("Background step executed: User is logged into cwp portal");
  
});

When('user selects a parent {string} template', async ({ }, arg) => {
  console.log("Background step executed: User is logged into cwp portal");
});