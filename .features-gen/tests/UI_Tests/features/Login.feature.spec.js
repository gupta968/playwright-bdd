// Generated from: tests\UI_Tests\features\Login.feature
import { test } from "../../../../tests/UI_Tests/fixtures/fixtures.ts";

test.describe('Verify Login', () => {

  test.beforeEach('Background: user is logged into the application', async ({ Given, loginPage }, testInfo) => { if (testInfo.error) return;
    await Given('User is logged into cwp portal', null, { loginPage }); 
  });
  
  test('create asset instance from UI', async ({ Given, When }) => { 
    await Given('user navigates to Create screen of "asset" instances'); 
    await When('user selects a parent "asset" template'); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('tests\\UI_Tests\\features\\Login.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":10,"pickleLine":9,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given User is logged into cwp portal","isBg":true,"stepMatchArguments":[]},{"pwStepLine":11,"gherkinStepLine":10,"keywordType":"Context","textWithKeyword":"Given user navigates to Create screen of \"asset\" instances","stepMatchArguments":[{"group":{"start":35,"value":"\"asset\"","children":[{"start":36,"value":"asset","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":12,"gherkinStepLine":11,"keywordType":"Action","textWithKeyword":"When user selects a parent \"asset\" template","stepMatchArguments":[{"group":{"start":22,"value":"\"asset\"","children":[{"start":23,"value":"asset","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end