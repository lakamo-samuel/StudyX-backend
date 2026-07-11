import type { Config } from "jest";

const config: Config = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ['**/__test__/**/*.test.ts'],
    setupFiles: ['dotenv/config'],
    forceExit:true,
    transform:{
        "^.+\\\.ts$": ["ts-jest", { diagnostics: false}]
    }
};
export default config
