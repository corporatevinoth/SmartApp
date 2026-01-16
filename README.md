# NumScan 📱

**NumScan** is a Progressive Web Application (PWA) that allows users to scan phone numbers instantly using their device camera or by uploading an image. It uses optical character recognition (OCR) to detect numbers and provides quick actions to call or copy them.

## 🔗 Live Demo / Mobile Access
Access the application directly on your mobile device (iOS/Android) or desktop:

👉 **[https://corporatevinoth.github.io/SmartApp/](https://corporatevinoth.github.io/SmartApp/)**

> **Note**: For the camera to work, you must access the site via **HTTPS** (which the link above provides) or `localhost`.

## ✨ Features
- **Instant Camera Scan**: Point your camera at any document or business card to detect phone numbers.
- **Image Upload**: Upload screenshots or photos from your gallery for scanning.
- **Smart Parsing**: Automatically cleans and extracts formatted phone numbers (e.g., `+1 555-123-4567`).
- **Privacy First**: All processing happens **client-side** in your browser using Tesseract.js. No images are sent to any server.
- **PWA Ready**: Installable on mobile devices for a native app-like experience.

## 🛠️ Built With
- **HTML5 & Vanilla JavaScript**: Lightweight and fast.
- **Tailwind CSS**: Modern, responsive styling.
- **Tesseract.js**: Powerful OCR engine running in the browser.

## 💻 Local Development
If you want to run this locally:

1. Clone the repository.
   ```bash
   git clone https://github.com/corporatevinoth/SmartApp.git
   ```
2. Navigate to the project folder.
3. Start a local server (Required for Camera access).
   - **VS Code**: Use "Live Server" extension.
   - **Python**: Run `python -m http.server`
   - **Node**: Run `npx serve`
4. Open `http://localhost:8000` (or whatever port your server uses).
