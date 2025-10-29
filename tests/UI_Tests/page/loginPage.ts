import { Locator, Page } from "@playwright/test";
import { BasePage } from "./BasePage";


export class LoginPage extends BasePage {
  
    constructor(page: Page) {
        super(page);
    }
    async navigateToLoginPage(url: string) {
        await this.page.goto(url);
    }

    async login(username: string, password: string) {
        await this.page.locator('input[name="username"]').click();
        await this.page.locator('input[name="username"]').fill(username);
        console.log("Entered Username");
        await this.page.getByRole('button', { name: 'Next' }).click();
        await this.page.getByRole('textbox', { name: 'Username' }).click();
        await this.page.locator('input[name="username"]').fill(username);
        await this.page.getByPlaceholder('Password').click();
        await this.page.getByPlaceholder('Password').fill(password);
        await this.page.getByRole('button', { name: 'Sign On' }).click();
    }
}
