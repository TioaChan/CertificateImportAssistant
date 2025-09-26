const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");
const forge = require("node-forge");

let mainWindow;

function createWindow() {
    const preloadPath = path.join(__dirname, "../preload/preload.js");
    console.log("Preload script path:", preloadPath);
    console.log("Preload script exists:", fs.existsSync(preloadPath));

    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: preloadPath,
        },
        icon: path.join(__dirname, "../../assets/icon.png"),
        show: false,
        autoHideMenuBar: true,
    });

    const isDev = !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL("http://localhost:5173");
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(
            path.join(__dirname, "../renderer/dist/index.html")
        );
    }

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// IPC handlers for certificate operations
ipcMain.handle("get-certificates", async () => {
    try {
        const certDir = app.isPackaged
            ? path.join(process.resourcesPath, "cert")
            : path.join(__dirname, "../../cert");

        const files = fs.readdirSync(certDir);
        const certificates = [];

        for (const file of files) {
            if (
                file.endsWith(".pem") ||
                file.endsWith(".crt") ||
                file.endsWith(".cert")
            ) {
                const filePath = path.join(certDir, file);
                const content = fs.readFileSync(filePath, "utf8");

                // Parse certificate info
                const certInfo = await parseCertificate(content, file);
                const isInstalled = await checkCertificateInstalled(
                    content,
                    certInfo
                );

                certificates.push({
                    filename: file,
                    path: filePath,
                    content: content,
                    info: certInfo,
                    isInstalled: isInstalled,
                });
            }
        }

        return certificates;
    } catch (error) {
        console.error("Error reading certificates:", error);
        return [];
    }
});

ipcMain.handle("install-certificate", async (event, certificateContent) => {
    try {
        const result = await installCertificate(certificateContent);
        return result;
    } catch (error) {
        console.error("Error installing certificate:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("refresh-certificate-status", async (event, certificates) => {
    try {
        console.log(
            "Refreshing certificate status for",
            certificates.length,
            "certificates"
        );
        const refreshedCertificates = [];

        for (const cert of certificates) {
            try {
                const isInstalled = await checkCertificateInstalled(
                    cert.content,
                    cert.info
                );
                console.log(
                    `Certificate ${cert.filename}: ${isInstalled ? "INSTALLED" : "NOT_INSTALLED"}`
                );

                // Return a clean, serializable object
                refreshedCertificates.push({
                    filename: cert.filename,
                    content: cert.content,
                    info: cert.info,
                    isInstalled: isInstalled,
                    installing: false,
                });
            } catch (certError) {
                console.error(
                    `Error checking certificate ${cert.filename}:`,
                    certError
                );
                // Include the certificate with error status
                refreshedCertificates.push({
                    filename: cert.filename,
                    content: cert.content,
                    info: cert.info,
                    isInstalled: false, // Default to false on error
                    installing: false,
                });
            }
        }

        console.log("Certificate status refresh completed");
        return refreshedCertificates;
    } catch (error) {
        console.error("Error refreshing certificate status:", error);
        // Return original certificates on error to prevent data loss
        return certificates.map((cert) => ({
            filename: cert.filename,
            content: cert.content,
            info: cert.info,
            isInstalled: cert.isInstalled || false,
            installing: false,
        }));
    }
});

ipcMain.handle("install-all-certificates", async (event, certificates) => {
    try {
        const results = [];
        for (const cert of certificates) {
            if (!cert.isInstalled) {
                const result = await installCertificate(cert.content);
                results.push({ filename: cert.filename, ...result });
            }
        }
        return results;
    } catch (error) {
        console.error("Error installing certificates:", error);
        return { success: false, error: error.message };
    }
});

async function parseCertificate(content, filename) {
    try {
        // Use node-forge to parse the certificate
        const cert = forge.pki.certificateFromPem(content);

        // Extract Common Name from subject
        const cnAttribute = cert.subject.attributes.find(
            (attr) => attr.shortName === "CN"
        );
        const commonName = cnAttribute
            ? cnAttribute.value
            : filename.replace(/\.(pem|crt|cert)$/, "");

        // Extract certificate information
        return {
            name: filename.replace(/\.(pem|crt|cert)$/, ""),
            commonName: commonName,
            subject: cert.subject.attributes
                .map((attr) => `${attr.shortName}=${attr.value}`)
                .join(", "),
            issuer: cert.issuer.attributes
                .map((attr) => `${attr.shortName}=${attr.value}`)
                .join(", "),
            validFrom: cert.validity.notBefore.toISOString().split("T")[0],
            validTo: cert.validity.notAfter.toISOString().split("T")[0],
            serialNumber: cert.serialNumber,
            fingerprint: forge.md.sha1
                .create()
                .update(
                    forge.asn1
                        .toDer(forge.pki.certificateToAsn1(cert))
                        .getBytes()
                )
                .digest()
                .toHex()
                .toUpperCase()
                .match(/.{2}/g)
                .join(":"),
        };
    } catch (error) {
        console.error("Error parsing certificate:", error);
        // Fallback to basic info if parsing fails
        return {
            name: filename.replace(/\.(pem|crt|cert)$/, ""),
            commonName: filename.replace(/\.(pem|crt|cert)$/, ""),
            subject: "Certificate parsing failed",
            issuer: "Unknown",
            validFrom: "Unknown",
            validTo: "Unknown",
            serialNumber: "Unknown",
            fingerprint: "Unknown",
        };
    }
}

async function checkCertificateInstalled(certificateContent, certInfo) {
    return new Promise((resolve) => {
        const platform = os.platform();

        if (platform === "win32") {
            // Windows - use certutil to check certificate status by comparing fingerprints
            console.log("=== Windows Certificate Check using certutil ===");
            console.log(
                "Checking certificate fingerprint:",
                certInfo.fingerprint
            );

            // Use certutil to list all certificates in Root store and search for our fingerprint
            const certutil = spawn("certutil", ["-store", "Root"], {
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true,
            });

            let output = "";
            let errorOutput = "";

            certutil.stdout.on("data", (data) => {
                output += data.toString();
            });

            certutil.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            certutil.on("close", (code) => {
                console.log("certutil exit code:", code);
                if (errorOutput.trim()) {
                    console.log("certutil error output:", errorOutput.trim());
                }

                let isInstalled = false;

                if (code === 0) {
                    // Parse the output to find certificate fingerprints
                    // Look for our certificate's fingerprint in the output
                    const fingerprint = certInfo.fingerprint
                        .replace(/:/g, "")
                        .toLowerCase();
                    const outputLower = output.toLowerCase().replace(/\s/g, "");

                    // certutil -store output contains "Cert Hash(sha1):" followed by the fingerprint
                    if (outputLower.includes(fingerprint)) {
                        isInstalled = true;
                        console.log(
                            "Certificate fingerprint found in Root store"
                        );
                    } else {
                        console.log(
                            "Certificate fingerprint not found in Root store"
                        );
                    }
                } else {
                    console.log("Failed to list Root store certificates");
                }

                console.log(
                    "Certificate check result:",
                    isInstalled
                        ? "CERTIFICATE TRUSTED"
                        : "CERTIFICATE NOT TRUSTED"
                );
                console.log("===============================================");
                resolve(isInstalled);
            });

            certutil.on("error", (error) => {
                console.error("certutil command error:", error);
                console.log("Defaulting to NOT TRUSTED due to certutil error");
                resolve(false);
            });
        } else if (platform === "darwin") {
            // macOS - use security command to find certificate
            const tempFile = path.join(
                os.tmpdir(),
                `temp_cert_${Date.now()}.pem`
            );
            fs.writeFileSync(tempFile, certificateContent);

            // Check if certificate exists in system keychain
            const security = spawn("security", [
                "find-certificate",
                "-c",
                certInfo.subject.split(",")[0].replace("CN=", ""),
                "/Library/Keychains/System.keychain",
            ]);

            security.on("close", (code) => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}
                resolve(code === 0);
            });

            security.on("error", () => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}
                resolve(false);
            });
        } else {
            // Linux or other - basic implementation
            resolve(false);
        }
    });
}

async function installCertificate(certificateContent) {
    return new Promise((resolve) => {
        const platform = os.platform();

        if (platform === "win32") {
            // Windows - use certutil command with UAC elevation
            const tempFile = path.join(
                os.tmpdir(),
                `install_cert_${Date.now()}.pem`
            );
            fs.writeFileSync(tempFile, certificateContent);

            console.log(
                "=== Windows Certificate Installation using certutil ==="
            );
            console.log("Installing certificate:", tempFile);

            // Use certutil with UAC elevation - simplified command for better compatibility
            // For self-signed certificates, we use -f flag to force installation
            const powershellCommand = `
$process = Start-Process -FilePath "certutil.exe" -ArgumentList "-addstore", "-f", "Root", "${tempFile}" -Verb RunAs -Wait -PassThru
Write-Output "ExitCode: $($process.ExitCode)"
`.trim();

            const powershell = spawn(
                "powershell.exe",
                [
                    "-ExecutionPolicy",
                    "Bypass",
                    "-NoProfile",
                    "-WindowStyle",
                    "Hidden",
                    "-Command",
                    powershellCommand,
                ],
                {
                    stdio: ["pipe", "pipe", "pipe"],
                    windowsHide: true,
                }
            );

            let output = "";
            let errorOutput = "";

            powershell.stdout.on("data", (data) => {
                output += data.toString();
            });

            powershell.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            powershell.on("close", (code) => {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                } catch (e) {
                    console.error("Error cleaning up temp file:", e);
                }

                console.log("=== Certificate Installation Results ===");
                console.log("PowerShell exit code:", code);
                console.log("Output:", output.trim());
                if (errorOutput.trim()) {
                    console.log("Error output:", errorOutput.trim());
                }

                // Parse the output to get the actual certutil exit code
                let certutilExitCode = null;
                const exitCodeMatch = output.match(/ExitCode\s*:\s*(\d+)/i);
                if (exitCodeMatch) {
                    certutilExitCode = parseInt(exitCodeMatch[1]);
                    console.log("Certutil exit code:", certutilExitCode);
                }

                // Determine success based on certutil exit code
                let success = false;
                let message = "";

                if (certutilExitCode === 0) {
                    success = true;
                    message = "证书导入成功（已自动提权）";
                } else if (certutilExitCode === null && code === 0) {
                    // Fallback: if we can't parse certutil exit code but PowerShell succeeded
                    success = true;
                    message = "证书导入成功";
                } else if (
                    errorOutput.includes("cancelled") ||
                    errorOutput.includes("用户取消") ||
                    errorOutput.includes("was cancelled")
                ) {
                    success = false;
                    message = "用户取消了权限提升请求";
                } else {
                    success = false;
                    message = `证书导入失败 (certutil exit code: ${certutilExitCode || "unknown"})`;
                }

                console.log(
                    "Installation result:",
                    success ? "SUCCESS" : "FAILED"
                );
                console.log("========================================");

                resolve({
                    success: success,
                    error: success ? undefined : message,
                    message: success ? message : undefined,
                });
            });

            powershell.on("error", (error) => {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                } catch (e) {}
                console.error("PowerShell spawn error:", error);
                resolve({
                    success: false,
                    error: `权限提升失败: ${error.message}`,
                });
            });
        } else if (platform === "darwin") {
            // macOS - use osascript for privilege escalation with security command
            const tempFile = path.join(
                os.tmpdir(),
                `install_cert_${Date.now()}.pem`
            );
            fs.writeFileSync(tempFile, certificateContent);

            // Create an AppleScript that prompts for admin password and runs security command
            const appleScript = `
do shell script "security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain '${tempFile}'" with administrator privileges
`;

            const osascript = spawn("osascript", ["-e", appleScript]);

            let output = "";
            let errorOutput = "";

            osascript.stdout.on("data", (data) => {
                output += data.toString();
            });

            osascript.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            osascript.on("close", (code) => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}

                if (code === 0) {
                    resolve({
                        success: true,
                        message: "证书导入成功（已自动提权）",
                    });
                } else {
                    const errorMsg = errorOutput || "未知错误";
                    if (
                        errorMsg.includes("User cancelled") ||
                        errorMsg.includes("用户取消")
                    ) {
                        resolve({
                            success: false,
                            error: "用户取消了权限提升请求",
                        });
                    } else {
                        resolve({
                            success: false,
                            error: `证书导入失败: ${errorMsg}`,
                        });
                    }
                }
            });

            osascript.on("error", (error) => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}
                resolve({
                    success: false,
                    error: `权限提升失败: ${error.message}`,
                });
            });
        } else {
            // Linux or other - use pkexec for privilege escalation
            const tempFile = path.join(
                os.tmpdir(),
                `install_cert_${Date.now()}.pem`
            );
            fs.writeFileSync(tempFile, certificateContent);

            // Try to copy certificate to system trust store with pkexec
            const pkexec = spawn("pkexec", [
                "cp",
                tempFile,
                "/usr/local/share/ca-certificates/",
            ]);

            pkexec.on("close", (code) => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}

                if (code === 0) {
                    // Update certificate store
                    const updateCerts = spawn("pkexec", [
                        "update-ca-certificates",
                    ]);
                    updateCerts.on("close", (updateCode) => {
                        if (updateCode === 0) {
                            resolve({
                                success: true,
                                message: "证书导入成功（已自动提权）",
                            });
                        } else {
                            resolve({
                                success: false,
                                error: "证书导入成功但更新证书存储失败",
                            });
                        }
                    });
                } else {
                    resolve({
                        success: false,
                        error: "证书导入失败，权限提升被拒绝或系统不支持",
                    });
                }
            });

            pkexec.on("error", (error) => {
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {}
                resolve({
                    success: false,
                    error: `权限提升失败: ${error.message}`,
                });
            });
        }
    });
}
