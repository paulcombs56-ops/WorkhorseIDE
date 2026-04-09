const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("workhorseElectron", {
  isElectron: true,
  pickFolder: () => ipcRenderer.invoke("workhorse:pick-folder"),
  getSecret: (key) => ipcRenderer.invoke("workhorse:get-secret", key),
  setSecret: (key, value) => ipcRenderer.invoke("workhorse:set-secret", key, value),
});
