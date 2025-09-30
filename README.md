# Network Assistant (网络助手)

A cross-platform network and certificate management assistant built with Electron, Vue3, and ElementPlus. This tool helps you manage system certificates and monitor network connectivity.

![Network Assistant](https://github.com/user-attachments/assets/4ce00c88-806d-4e60-8c29-575d8b5e6f21)

## Features (功能特性)

- 🔒 **Certificate Management**: Automatically detect and display certificate files from the `cert` directory
- 🔍 **Trust Status Detection**: Check if certificates are already trusted by the system
- 🌐 **Network Detection**: Monitor domain accessibility with DNS resolution and ping tests
- 📊 **Real-time Status**: Display network response times and error messages with tooltips
- 📱 **Modern UI**: Beautiful responsive interface built with Vue3 and ElementPlus
- 🚀 **One-Click Import**: Import individual certificates or all certificates at once
- 💻 **Cross-Platform**: Support for Windows x64 and macOS ARM with platform-specific implementations
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
├── config/                  # Configuration directory
│   └── domains.json         # Domain list for network detection
├── src/
│   ├── main/               # Electron main process
│   │   ├── main.js
│   │   └── platforms/      # Platform-specific implementations
│   │       ├── factory.js              # Certificate manager factory
│   │       ├── windows.js              # Windows certificate operations
│   │       ├── macos.js                # macOS certificate operations
│   │       ├── linux.js                # Linux certificate operations
│   │       ├── network-factory.js      # Network checker factory
│   │       ├── network-windows.js      # Windows network detection
│   │       ├── network-macos.js        # macOS network detection
│   │       └── network-linux.js        # Linux network detection
│   ├── preload/            # Electron preload scripts
│   │   └── preload.js
│   └── renderer/           # Vue application
│       └── App.vue
├── package.json
└── vite.config.js
```

## Network Detection Configuration (网络检测配置)

The application reads domain configurations from `config/domains.json`:

```json
[
    { "id": 1, "name": "GitHub", "domain": "github.com" },
    { "id": 2, "name": "Google", "domain": "google.com" },
    { "id": 3, "name": "百度", "domain": "baidu.com" }
]
```

Each domain entry includes:
- `id`: Unique identifier
- `name`: Display name
- `domain`: Domain name to check

The network detection performs:
1. DNS resolution to get IP address
2. Ping test to check connectivity
3. Response time measurement
4. Error detection with detailed messages (DNS failure, timeout, unreachable, etc.)

## Certificate Format Support (支持的证书格式)

- `.pem` - PEM encoded certificates
- `.crt` - Certificate files
- `.cert` - Certificate files

## Platform-Specific Implementation (平台特定实现)

### Certificate Management

#### Windows
- Uses PowerShell and `certutil` commands for certificate management
- Installs certificates to the Local Machine Root Certificate Store

#### macOS
- Uses `security` command for keychain management
- Installs certificates to System Keychain with root trust

#### Linux
- Basic implementation (extensible for future support)

### Network Detection

#### Windows
- Uses `ping` command with `-n 1 -w 5000` parameters
- DNS resolution via Node.js `dns.promises.resolve4()`
- Parses ping output to extract response time and error messages

#### macOS
- Uses `ping` command with `-c 1 -W 5000` parameters
- DNS resolution via Node.js `dns.promises.resolve4()`
- Parses ping output to extract response time and error messages

#### Linux
- Uses `ping` command with `-c 1 -W 5` parameters
- DNS resolution via Node.js `dns.promises.resolve4()`
- Parses ping output to extract response time and error messages

## Security Considerations (安全考虑)

- The application requires administrator privileges to install certificates to system trust stores
- All certificate operations are performed using native system commands
- Certificate content is temporarily written to system temp directory during installation
