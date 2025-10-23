const fs = require("fs");
const path = require("path");

/**
 * afterPack hook to remove ffmpeg from the Electron build
 * This reduces the package size by removing unnecessary media codecs
 */
exports.default = async function (context) {
    const { electronPlatformName, appOutDir } = context;

    console.log("Running afterPack hook to remove ffmpeg...");
    console.log("Platform:", electronPlatformName);
    console.log("Output directory:", appOutDir);

    // Define ffmpeg file patterns for different platforms
    const ffmpegPatterns = {
        darwin: ["libffmpeg.dylib"],
        linux: ["libffmpeg.so"],
        win32: ["ffmpeg.dll"],
    };

    const patterns = ffmpegPatterns[electronPlatformName];
    if (!patterns) {
        console.log(`No ffmpeg patterns defined for platform: ${electronPlatformName}`);
        return;
    }

    // Search for and remove ffmpeg files
    let removedCount = 0;
    for (const pattern of patterns) {
        const ffmpegPaths = await findFiles(appOutDir, pattern);
        for (const ffmpegPath of ffmpegPaths) {
            try {
                if (fs.existsSync(ffmpegPath)) {
                    const stats = fs.statSync(ffmpegPath);
                    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                    fs.unlinkSync(ffmpegPath);
                    console.log(`Removed ${pattern} (${sizeInMB} MB) from: ${ffmpegPath}`);
                    removedCount++;
                }
            } catch (error) {
                console.warn(`Failed to remove ${ffmpegPath}:`, error.message);
            }
        }
    }

    if (removedCount === 0) {
        console.log("No ffmpeg files found to remove");
    } else {
        console.log(`Successfully removed ${removedCount} ffmpeg file(s)`);
    }
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
