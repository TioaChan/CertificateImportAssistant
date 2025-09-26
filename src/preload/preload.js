const { contextBridge, ipcRenderer } = require('electron')

console.log('Preload script loaded successfully')

contextBridge.exposeInMainWorld('electronAPI', {
  getCertificates: () => ipcRenderer.invoke('get-certificates'),
  refreshCertificateStatus: (certificates) => ipcRenderer.invoke('refresh-certificate-status', certificates),
  installCertificate: (certificateContent) => ipcRenderer.invoke('install-certificate', certificateContent),
  installAllCertificates: (certificates) => ipcRenderer.invoke('install-all-certificates', certificates)
})

console.log('electronAPI exposed to main world')