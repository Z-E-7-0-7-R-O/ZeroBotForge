{
  "name": {{PACKAGE_NAME_JSON}},
  "version": "1.0.0",
  "private": true,
  "type": {{MODULE_TYPE_JSON}},
  "engines": {
    "node": {{NODE_ENGINE_RANGE_JSON}}
  },
  "scripts": {
    "dev": "tsx watch src/bot.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/bot.js"
  },
  "dependencies": {
    "dotenv": "^16.4.7",
    "telegraf": "^4.16.3"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
