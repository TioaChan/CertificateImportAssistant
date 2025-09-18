const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const os = require('os')
const forge = require('node-forge')

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
        const isInstalled = await checkCertificateInstalled(content, certInfo)
        
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
    // Use node-forge to parse the certificate
    const cert = forge.pki.certificateFromPem(content)
    
    // Extract certificate information
    return {
      name: filename.replace(/\.(pem|crt|cert)$/, ''),
      subject: cert.subject.attributes.map(attr => `${attr.shortName}=${attr.value}`).join(', '),
      issuer: cert.issuer.attributes.map(attr => `${attr.shortName}=${attr.value}`).join(', '),
      validFrom: cert.validity.notBefore.toISOString().split('T')[0],
      validTo: cert.validity.notAfter.toISOString().split('T')[0],
      serialNumber: cert.serialNumber,
      fingerprint: forge.md.sha1.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex().toUpperCase().match(/.{2}/g).join(':')
    }
  } catch (error) {
    console.error('Error parsing certificate:', error)
    // Fallback to basic info if parsing fails
    return {
      name: filename.replace(/\.(pem|crt|cert)$/, ''),
      subject: 'Certificate parsing failed',
      issuer: 'Unknown',
      validFrom: 'Unknown',
      validTo: 'Unknown',
      serialNumber: 'Unknown',
      fingerprint: 'Unknown'
    }
  }
}

async function checkCertificateInstalled(certificateContent, certInfo) {
  return new Promise((resolve) => {
    const platform = os.platform()
    
    if (platform === 'win32') {
      // Windows - use PowerShell to check certificate by thumbprint
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
        try { fs.unlinkSync(tempFile) } catch (e) {}
        resolve(output.trim() === 'true')
      })
      
      powershell.on('error', () => {
        try { fs.unlinkSync(tempFile) } catch (e) {}
        resolve(false)
      })
      
    } else if (platform === 'darwin') {
      // macOS - use security command to find certificate
      const tempFile = path.join(os.tmpdir(), `temp_cert_${Date.now()}.pem`)
      fs.writeFileSync(tempFile, certificateContent)
      
      // Check if certificate exists in system keychain
      const security = spawn('security', [
        'find-certificate', 
        '-c', certInfo.subject.split(',')[0].replace('CN=', ''), 
        '/Library/Keychains/System.keychain'
      ])
      
      security.on('close', (code) => {
        try { fs.unlinkSync(tempFile) } catch (e) {}
        resolve(code === 0)
      })
      
      security.on('error', () => {
        try { fs.unlinkSync(tempFile) } catch (e) {}
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
      // Windows - use PowerShell with UAC elevation
      const tempFile = path.join(os.tmpdir(), `install_cert_${Date.now()}.pem`)
      fs.writeFileSync(tempFile, certificateContent)
      
      // Create a PowerShell script that requests elevation
      const scriptContent = `
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2("${tempFile}")
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)
try {
  $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
  $store.Add($cert)
  $store.Close()
  Write-Output "SUCCESS: Certificate installed successfully"
} catch {
  Write-Output "ERROR: $($_.Exception.Message)"
}
Remove-Item "${tempFile}" -Force -ErrorAction SilentlyContinue
`
      
      const scriptFile = path.join(os.tmpdir(), `install_cert_${Date.now()}.ps1`)
      fs.writeFileSync(scriptFile, scriptContent)
      
      // Execute PowerShell with elevation request
      const powershell = spawn('powershell', [
        '-Command',
        `Start-Process PowerShell -ArgumentList "-ExecutionPolicy Bypass -File \\"${scriptFile}\\"" -Verb RunAs -Wait -WindowStyle Hidden; Get-Content "${scriptFile}.log" -ErrorAction SilentlyContinue`
      ], { shell: true })
      
      let output = ''
      powershell.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      powershell.stderr.on('data', (data) => {
        output += data.toString()
      })
      
      powershell.on('close', (code) => {
        try { 
          fs.unlinkSync(tempFile) 
          fs.unlinkSync(scriptFile)
        } catch (e) {}
        
        if (output.includes('SUCCESS:') || code === 0) {
          resolve({ success: true, message: '证书导入成功（已自动提权）' })
        } else if (output.includes('ERROR:')) {
          const errorMsg = output.split('ERROR:')[1]?.trim() || 'Unknown error'
          resolve({ success: false, error: `证书导入失败: ${errorMsg}` })
        } else {
          resolve({ success: false, error: '证书导入失败，可能用户取消了权限提升或系统不支持' })
        }
      })
      
      powershell.on('error', (error) => {
        try { 
          fs.unlinkSync(tempFile) 
          fs.unlinkSync(scriptFile)
        } catch (e) {}
        resolve({ success: false, error: `权限提升失败: ${error.message}` })
      })
      
    } else if (platform === 'darwin') {
      // macOS - use osascript for privilege escalation with security command
      const tempFile = path.join(os.tmpdir(), `install_cert_${Date.now()}.pem`)
      fs.writeFileSync(tempFile, certificateContent)
      
      // Create an AppleScript that prompts for admin password and runs security command
      const appleScript = `
do shell script "security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain '${tempFile}'" with administrator privileges
`
      
      const osascript = spawn('osascript', ['-e', appleScript])
      
      let output = ''
      let errorOutput = ''
      
      osascript.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      osascript.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })
      
      osascript.on('close', (code) => {
        try { fs.unlinkSync(tempFile) } catch (e) {}
        
        if (code === 0) {
          resolve({ success: true, message: '证书导入成功（已自动提权）' })
        } else {
          const errorMsg = errorOutput || '未知错误'
          if (errorMsg.includes('User cancelled') || errorMsg.includes('用户取消')) {
            resolve({ success: false, error: '用户取消了权限提升请求' })
          } else {
            resolve({ success: false, error: `证书导入失败: ${errorMsg}` })
          }
        }
      })
      
      osascript.on('error', (error) => {
        try { fs.unlinkSync(tempFile) } catch (e) {}
        resolve({ success: false, error: `权限提升失败: ${error.message}` })
      })
      
    } else {
      // Linux or other - use pkexec for privilege escalation
      const tempFile = path.join(os.tmpdir(), `install_cert_${Date.now()}.pem`)
      fs.writeFileSync(tempFile, certificateContent)
      
      // Try to copy certificate to system trust store with pkexec
      const pkexec = spawn('pkexec', ['cp', tempFile, '/usr/local/share/ca-certificates/'])
      
      pkexec.on('close', (code) => {
        try { fs.unlinkSync(tempFile) } catch (e) {}
        
        if (code === 0) {
          // Update certificate store
          const updateCerts = spawn('pkexec', ['update-ca-certificates'])
          updateCerts.on('close', (updateCode) => {
            if (updateCode === 0) {
              resolve({ success: true, message: '证书导入成功（已自动提权）' })
            } else {
              resolve({ success: false, error: '证书导入成功但更新证书存储失败' })
            }
          })
        } else {
          resolve({ success: false, error: '证书导入失败，权限提升被拒绝或系统不支持' })
        }
      })
      
      pkexec.on('error', (error) => {
        try { fs.unlinkSync(tempFile) } catch (e) {}
        resolve({ success: false, error: `权限提升失败: ${error.message}` })
      })
    }
  })
}