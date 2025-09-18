const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getCertificates: () => ipcRenderer.invoke('get-certificates'),
  installCertificate: (certificateContent) => ipcRenderer.invoke('install-certificate', certificateContent),
  installAllCertificates: (certificates) => ipcRenderer.invoke('install-all-certificates', certificates)
})