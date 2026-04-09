module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "WorkhorseIDE",
    ignore: [
      /^\/\.venv/,
      /^\/\.vs/,
      /^\/\.vscode/,
      /^\/sandbox\/runs/,
      /^\/ai_backend/,
      /^\/backend\/node_modules/,
      /^\/frontend\/node_modules/,
      /^\/smoke-latest\.out$/,
    ],
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "workhorse_ide",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
  ],
};
