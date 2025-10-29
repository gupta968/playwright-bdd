import {test as base}   from "playwright-bdd";
import * as Pages from "../page/index.ts";


type MyFixtures = {
    loginPage: Pages.LoginPage;
};
export const test = base.extend<MyFixtures>({
    loginPage: async ({ page }, use) => {
        const loginObj = new Pages.LoginPage(page);
        await use(loginObj);
    },
});