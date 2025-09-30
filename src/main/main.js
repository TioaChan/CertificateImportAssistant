const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const forge = require("node-forge");
const PlatformCertificateManagerFactory = require("./platforms/factory");
const PlatformNetworkCheckerFactory = require("./platforms/network-factory");

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

// Network detection IPC handlers
ipcMain.handle("get-domains", async () => {
    try {
        const configDir = app.isPackaged
            ? path.join(process.resourcesPath, "config")
            : path.join(__dirname, "../../config");
        
        const domainsPath = path.join(configDir, "domains.json");
        
        if (fs.existsSync(domainsPath)) {
            const domainsContent = fs.readFileSync(domainsPath, "utf8");
            const domains = JSON.parse(domainsContent);
            return domains;
        } else {
            console.warn("domains.json not found at:", domainsPath);
            return [];
        }
    } catch (error) {
        console.error("Error reading domains:", error);
        return [];
    }
});

ipcMain.handle("check-domain-status", async (event, domain) => {
    try {
        const result = await PlatformNetworkCheckerFactory.checkDomainStatus(domain);
        return result;
    } catch (error) {
        console.error("Error checking domain status:", error);
        return {
            accessible: false,
            errorMessage: error.message,
            ip: null,
            responseTime: null
        };
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
    return await PlatformCertificateManagerFactory.checkCertificateInstalled(
        certificateContent,
        certInfo
    );
}

async function installCertificate(certificateContent) {
    return await PlatformCertificateManagerFactory.installCertificate(certificateContent);
}
