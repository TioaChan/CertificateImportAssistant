const fs = require("fs");
const path = require("path");

/**
 * afterPack hook to remove unnecessary files from the Electron build
 * This reduces the package size by removing:
 * - ffmpeg (media codecs not needed)
 * - Unnecessary locale files (keep only zh-CN, zh-TW, en-US)
 */
exports.default = async function (context) {
    const { electronPlatformName, appOutDir } = context;

    console.log("Running afterPack hook to optimize package size...");
    console.log("Platform:", electronPlatformName);
    console.log("Output directory:", appOutDir);

    let totalSavedMB = 0;

    // 1. Remove ffmpeg files
    console.log("\n[1/2] Removing ffmpeg...");
    const ffmpegPatterns = {
        darwin: ["libffmpeg.dylib"],
        linux: ["libffmpeg.so"],
        win32: ["ffmpeg.dll"],
    };

    const patterns = ffmpegPatterns[electronPlatformName];
    if (patterns) {
        let removedCount = 0;
        for (const pattern of patterns) {
            const ffmpegPaths = await findFiles(appOutDir, pattern);
            for (const ffmpegPath of ffmpegPaths) {
                try {
                    if (fs.existsSync(ffmpegPath)) {
                        const stats = fs.statSync(ffmpegPath);
                        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                        fs.unlinkSync(ffmpegPath);
                        console.log(`  ✓ Removed ${pattern} (${sizeInMB} MB)`);
                        totalSavedMB += parseFloat(sizeInMB);
                        removedCount++;
                    }
                } catch (error) {
                    console.warn(`  ✗ Failed to remove ${ffmpegPath}:`, error.message);
                }
            }
        }

        if (removedCount === 0) {
            console.log("  No ffmpeg files found");
        }
    } else {
        console.log(`  No ffmpeg patterns defined for platform: ${electronPlatformName}`);
    }

    // 2. Remove unnecessary locale files (keep only zh-CN, zh-TW, en-US)
    console.log("\n[2/2] Removing unnecessary locale files...");
    const localesDir = path.join(appOutDir, "locales");
    if (fs.existsSync(localesDir)) {
        // Locales to keep for this Chinese application
        const keepLocales = ["zh-CN.pak", "zh-TW.pak", "en-US.pak"];
        
        try {
            const localeFiles = fs.readdirSync(localesDir);
            let removedLocaleCount = 0;
            let savedLocaleMB = 0;

            for (const file of localeFiles) {
                if (file.endsWith(".pak") && !keepLocales.includes(file)) {
                    const filePath = path.join(localesDir, file);
                    try {
                        const stats = fs.statSync(filePath);
                        const sizeInMB = stats.size / (1024 * 1024);
                        fs.unlinkSync(filePath);
                        savedLocaleMB += sizeInMB;
                        removedLocaleCount++;
                    } catch (error) {
                        console.warn(`  ✗ Failed to remove ${file}:`, error.message);
                    }
                }
            }

            if (removedLocaleCount > 0) {
                console.log(`  ✓ Removed ${removedLocaleCount} locale files (${savedLocaleMB.toFixed(2)} MB)`);
                console.log(`  ✓ Kept locales: ${keepLocales.join(", ")}`);
                totalSavedMB += savedLocaleMB;
            } else {
                console.log("  No unnecessary locale files found");
            }
        } catch (error) {
            console.warn("  ✗ Failed to process locales directory:", error.message);
        }
    } else {
        console.log("  Locales directory not found");
    }

    // Summary
    console.log(`\n✓ Package optimization complete! Total saved: ${totalSavedMB.toFixed(2)} MB`);
};

/**
 * Recursively search for files matching a pattern
 */
async function findFiles(dir, filename) {
    const results = [];
    
    try {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                results.push(...await findFiles(filePath, filename));
            } else if (file === filename) {
                results.push(filePath);
            }
        }
    } catch (error) {
        // Ignore errors from directories we can't access
    }
    
    return results;
}
