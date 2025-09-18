const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const os = require('os')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false,
    autoHideMenuBar: true
  })

  const isDev = !app.isPackaged

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC handlers for certificate operations
ipcMain.handle('get-certificates', async () => {
  try {
    const certDir = app.isPackaged 
      ? path.join(process.resourcesPath, 'cert')
      : path.join(__dirname, '../../cert')
    
    const files = fs.readdirSync(certDir)
    const certificates = []

    for (const file of files) {
      if (file.endsWith('.pem') || file.endsWith('.crt') || file.endsWith('.cert')) {
        const filePath = path.join(certDir, file)
        const content = fs.readFileSync(filePath, 'utf8')
        
        // Parse certificate info
        const certInfo = await parseCertificate(content, file)
        const isInstalled = await checkCertificateInstalled(content)
        
        certificates.push({
          filename: file,
          path: filePath,
          content: content,
          info: certInfo,
          isInstalled: isInstalled
        })
      }
    }

    return certificates
  } catch (error) {
    console.error('Error reading certificates:', error)
    return []
  }
})

ipcMain.handle('install-certificate', async (event, certificateContent) => {
  try {
    const result = await installCertificate(certificateContent)
    return result
  } catch (error) {
    console.error('Error installing certificate:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('install-all-certificates', async (event, certificates) => {
  try {
    const results = []
    for (const cert of certificates) {
      if (!cert.isInstalled) {
        const result = await installCertificate(cert.content)
        results.push({ filename: cert.filename, ...result })
      }
    }
    return results
  } catch (error) {
    console.error('Error installing certificates:', error)
    return { success: false, error: error.message }
  }
})

async function parseCertificate(content, filename) {
  try {
    // Basic certificate info parsing - in a real app you'd use a proper cert parser
    const lines = content.split('\n')
    const certData = lines.slice(1, -2).join('')
    
    // For demonstration, we'll extract some basic info from the filename and content
    return {
      name: filename.replace(/\.(pem|crt|cert)$/, ''),
      subject: 'Certificate Subject', // Would need proper parsing
      issuer: 'Certificate Issuer',   // Would need proper parsing
      validFrom: 'Start Date',        // Would need proper parsing
      validTo: 'End Date',            // Would need proper parsing
      serialNumber: 'Serial Number'  // Would need proper parsing
    }
  } catch (error) {
    return {
      name: filename,
      subject: 'Unknown',
      issuer: 'Unknown',
      validFrom: 'Unknown',
      validTo: 'Unknown',
      serialNumber: 'Unknown'
    }
  }
}

async function checkCertificateInstalled(certificateContent) {
  return new Promise((resolve) => {
    const platform = os.platform()
    
    if (platform === 'win32') {
      // Windows - use certlm.msc or powershell
      const tempFile = path.join(os.tmpdir(), `temp_cert_${Date.now()}.pem`)
      fs.writeFileSync(tempFile, certificateContent)
      
      const powershell = spawn('powershell', [
        '-Command',
        `$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2("${tempFile}"); $store = New-Object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine); $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly); $found = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }; if ($found) { Write-Output "true" } else { Write-Output "false" }; $store.Close()`
      ])
      
      let output = ''
      powershell.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      powershell.on('close', (code) => {
        fs.unlinkSync(tempFile)
        resolve(output.trim() === 'true')
      })
      
      powershell.on('error', () => {
        fs.unlinkSync(tempFile)
        resolve(false)
      })
      
    } else if (platform === 'darwin') {
      // macOS - use security command
      const tempFile = path.join(os.tmpdir(), `temp_cert_${Date.now()}.pem`)
      fs.writeFileSync(tempFile, certificateContent)
      
      const security = spawn('security', ['find-certificate', '-a', '-c', tempFile, '/System/Library/Keychains/SystemRootCertificates.keychain'])
      
      security.on('close', (code) => {
        fs.unlinkSync(tempFile)
        resolve(code === 0)
      })
      
      security.on('error', () => {
        fs.unlinkSync(tempFile)
        resolve(false)
      })
      
    } else {
      // Linux or other - basic implementation
      resolve(false)
    }
  })
}

async function installCertificate(certificateContent) {
  return new Promise((resolve) => {
    const platform = os.platform()
    
    if (platform === 'win32') {
      // Windows - use certlm.msc
      const tempFile = path.join(os.tmpdir(), `install_cert_${Date.now()}.pem`)
      fs.writeFileSync(tempFile, certificateContent)
      
      const certlm = spawn('certlm', ['-addstore', 'Root', tempFile], { shell: true })
      
      certlm.on('close', (code) => {
        fs.unlinkSync(tempFile)
        if (code === 0) {
          resolve({ success: true, message: 'Certificate installed successfully' })
        } else {
          resolve({ success: false, error: 'Failed to install certificate' })
        }
      })
      
      certlm.on('error', (error) => {
        fs.unlinkSync(tempFile)
        resolve({ success: false, error: error.message })
      })
      
    } else if (platform === 'darwin') {
      // macOS - use security command
      const tempFile = path.join(os.tmpdir(), `install_cert_${Date.now()}.pem`)
      fs.writeFileSync(tempFile, certificateContent)
      
      const security = spawn('security', ['add-trusted-cert', '-d', '-r', 'trustRoot', '-k', '/Library/Keychains/System.keychain', tempFile])
      
      security.on('close', (code) => {
        fs.unlinkSync(tempFile)
        if (code === 0) {
          resolve({ success: true, message: 'Certificate installed successfully' })
        } else {
          resolve({ success: false, error: 'Failed to install certificate. May require administrator privileges.' })
        }
      })
      
      security.on('error', (error) => {
        fs.unlinkSync(tempFile)
        resolve({ success: false, error: error.message })
      })
      
    } else {
      // Linux or other
      resolve({ success: false, error: 'Platform not supported yet' })
    }
  })
}