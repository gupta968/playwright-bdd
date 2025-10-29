import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
// Define __dirname for ES module
// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = process.env.ENV || 'local';
const envFilePath = resolve(__dirname, `../../env/${env}.env`);

// Export the configuration
export const config: IConfig = {
    emailReportingList: process.env.EMAIL_REPORT_LIST || 'nagendragupta.tunuguntla@honeywell.com',
    appUrl: process.env.APP_URL || 'https://epmui-stg.dev.forge.connected.honeywell.com/',
    apiUrl: process.env.API_URL || 'https://fpp-stdcfg-setup-sit.dev.forge.connected.honeywell.com/api/v1/tenants',
    userName: process.env.USER_NAME || '',
    password: process.env.PASSWORD || '',
    tenantId: process.env.TENANT_ID || '',
    environment: process.env.ENV || 'local',
    pgHost: process.env.PG_HOST || '',
    pgUser: process.env.PG_USER || '',
    pgDatabase: process.env.PG_DATABASE || '',
    pgPassword: process.env.PG_PASSWORD || '',
    queryApiUrl: process.env.QUERY_API_URL || '',
    coreObjectType: process.env.CORE_OBJECT_TYPE || 'space',
    parentTemplateExternalId: process.env.PARENT_TEMPLATE_EXTERNAL_ID || 'asset',
    tile: process.env.TILE || 'spaces',
    testKind: process.env.TEST_KIND || 'UI',
    downloadDir: process.env.DOWNLOAD_DIR || './downloads/csv/',
    logLevel: env === 'local' ? 'error' : 'info',
    emailTitle:
        `CWP: ${process.env.TILE?.toUpperCase()} - ${process.env.TEST_KIND?.toUpperCase()} Automation Test Report` ||
        'setup 2.0 automation',
};

interface IConfig {
    appUrl: string;
    apiUrl: string;
    userName: string;
    password: string;
    tenantId: string;
    environment: string;
    emailTitle: string;
    pgHost: string;
    pgUser: string;
    pgDatabase: string;
    pgPassword: string;
    queryApiUrl: string;
    emailReportingList: string;
    coreObjectType: string;
    parentTemplateExternalId: string;
    tile: string;
    testKind: string;
    downloadDir: string;
    logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
}
