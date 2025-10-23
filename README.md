# Certificate Import Assistant (证书导入助手)

A cross-platform certificate import assistant built with Electron, Vue3, and ElementPlus for importing certificate files to system root certificate trust zone.

![Certificate Import Assistant](https://github.com/user-attachments/assets/f9d16fc0-9feb-4be3-80e7-4bdfe1deb130)

## Features (功能特性)

- 🔒 **Certificate Management**: Automatically detect and display certificate files from the `cert` directory
- 🔍 **Trust Status Detection**: Check if certificates are already trusted by the system
- 📱 **Modern UI**: Beautiful responsive interface built with Vue3 and ElementPlus
- 🚀 **One-Click Import**: Import individual certificates or all certificates at once
- 🌐 **Cross-Platform**: Support for Windows x64 and macOS ARM
- 💚 **Portable**: Green software that doesn't pollute user directories

## Supported Platforms (支持的平台)

- Windows x64
- macOS ARM (Apple Silicon)

## Installation (安装)

1. Download the appropriate package for your platform from the releases page
2. Run the executable directly (no installation required)
3. The application will automatically detect certificate files in the bundled `cert` directory

## Development (开发)

### Prerequisites (前置要求)

- Node.js 20 or higher
- npm or yarn

### Setup (设置)

```bash
# Clone the repository
git clone https://github.com/TioaChan/CertificateImportAssistant.git
cd CertificateImportAssistant

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package for distribution
npm run build:electron
```

### Build Commands (构建命令)

```bash
# Development
npm run dev          # Run development server with hot reload
npm run dev:vue      # Run only Vue development server

# Production Build
npm run build        # Build Vue application
npm run build:electron  # Build and package Electron app
npm run build:win    # Build for Windows x64
npm run build:mac    # Build for macOS ARM
```

## Project Structure (项目结构)

```
CertificateImportAssistant/
├── cert/                    # Certificate files directory
│   └── *.pem|*.crt|*.cert  # Certificate files
├── src/
│   ├── main/               # Electron main process
│   │   └── main.js
│   ├── preload/            # Electron preload scripts
│   │   └── preload.js
│   └── renderer/           # Vue application
│       └── App.vue
├── package.json
└── vite.config.js
```

## Certificate Format Support (支持的证书格式)

- `.pem` - PEM encoded certificates
- `.crt` - Certificate files
- `.cert` - Certificate files

## Platform-Specific Implementation (平台特定实现)

### Windows
- Uses PowerShell and `certutil` commands for certificate management
- Installs certificates to the Local Machine Root Certificate Store

### macOS
- Uses `security` command for keychain management
- Installs certificates to System Keychain with root trust

### Linux
- Basic implementation (extensible for future support)

## Security Considerations (安全考虑)

- The application requires administrator privileges to install certificates to system trust stores
- All certificate operations are performed using native system commands
- Certificate content is temporarily written to system temp directory during installation

## Build Optimizations (构建优化)

The application uses a custom build script to reduce package size:

- **FFmpeg Removal**: Since this application doesn't require media playback capabilities, FFmpeg libraries are automatically removed during the build process using an `afterPack` hook
  - Saves approximately 1-3 MB per platform
- **Locale File Optimization**: Only essential locale files are kept (zh-CN, zh-TW, en-US), removing 50+ unnecessary locale files
  - Saves approximately 40 MB per platform
- **Total Package Size Reduction**: ~40-45 MB per build

The removal is handled by `build-scripts/afterPack.js` which runs after electron-builder packages the application
